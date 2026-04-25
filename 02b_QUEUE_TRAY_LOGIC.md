# Task 02b — 队列与托盘的精细化逻辑

> **优先级**：P0（与 02 共同构成核心循环的稳定性 gate）
> **预计工时**：1.5 小时（在 02 完成的基础上精化）
> **依赖**：Task 02
> **执行前必读**：`00_MASTER_SPEC.md`, `02_CORE_GAMEPLAY.md`

## 这份 spec 的目的

Task 02 描述了核心循环。这份 02b 是对其中**最容易出 bug 的一段**——队列入队、消除匹配、左移补位——做更严密的状态机设计。

> 关键背景：用户快速连点多个方块、磁铁吸附、Tray 完成的瞬间，很容易出现：
> - 同一个槽位被两颗弹珠占用（视觉重叠）
> - 弹珠飞向已满的 Tray
> - 数组索引错乱导致 splice 删错对象
>
> 解决思路：**同步数据更新 + 异步视觉动画完全解耦**。

---

## 核心架构原则（必须严格遵守）

### 原则 1：数据层立即更新，视觉层异步追赶

> "When a marble matches a tray, update the queue array and tray count IMMEDIATELY in memory. Then trigger the visual tweens. DO NOT wait for the flying animation to finish before updating array indices."

**反面例子（错误做法）**：

```javascript
// ❌ 错误：在 onComplete 里才删除数组元素
marble.flyTo(trayX, trayY, 400, () => {
  queue.marbles.splice(idx, 1);  // 这时玩家可能已经又点了一个方块
  tray.current_count++;
});
```

**正面例子（正确做法）**：

```javascript
// ✅ 正确：先同步更新数据，再启动动画
queue.marbles.splice(idx, 1);          // 数据：立即移除
tray.current_count++;                   // 数据：立即 +1
marble.state = 'flying-to-tray';        // 标记状态
marble.flyTo(trayX, trayY, 400, () => {
  marble.destroy();                     // 视觉：动画完销毁
  if (tray.current_count >= tray.capacity) tray._onComplete();
});
```

### 原则 2：弹珠状态机

每颗弹珠在生命周期里走过这些状态，状态切换是**单向的**：

```
created  →  falling  →  queued  →  flying-to-tray  →  destroyed
                                ↘
                                  flying-to-magnet → destroyed
                                ↘
                                  exiting (Game Over) → destroyed
```

**严格规则**：
- 只有 `state === 'queued'` 的弹珠才参与 `evaluateMatching` 检查
- `state === 'flying-to-tray'` 的弹珠**已经从 queue.marbles 数组移除**（数据层），但视觉对象还存在
- 一颗弹珠不可能从 `flying-to-tray` 回到 `queued`

### 原则 3：单一可变状态源

数据状态的唯一来源：

- `queue.marbles: Marble[]` — 当前在队列槽位中的弹珠（state === 'queued'）
- `tray.current_count: number` — 已收集数量（包含正在飞行中的）

**绝对不要**靠 "数一下场景里 'queued' 状态的弹珠" 来推断队列大小。永远以 `queue.marbles.length` 为准。

---

## 模块 A：Queue（队列）的精化实现

### A.1 槽位坐标计算

```javascript
// Queue 构造函数中预计算好所有槽位坐标
_computeSlotPositions() {
  const positions = [];
  const startX = CONFIG.QUEUE_AREA.x + 30;
  const stepX = (CONFIG.QUEUE_AREA.width - 60) / (this.capacity - 1);
  const y = CONFIG.QUEUE_AREA.y + CONFIG.QUEUE_AREA.height / 2;
  for (let i = 0; i < this.capacity; i++) {
    positions.push({ x: startX + i * stepX, y });
  }
  return positions;
}
```

**关键**：`this.capacity` 来自 level JSON 的 `queue_capacity` 字段，**不是全局常量**。每关可以不同。

### A.2 enqueue：加入队列

```javascript
enqueue(marble) {
  // ① 容量检查（数据层先判定）
  if (this.marbles.length >= this.capacity) {
    this._handleOverflow(marble);
    return;
  }
  
  // ② 同步：立即占据槽位（数据层）
  const slotIdx = this.marbles.length;
  this.marbles.push(marble);
  marble.state = 'queued';
  marble.slotIndex = slotIdx;
  
  // ③ 异步：动画到槽位（视觉层）
  const target = this.slotPositions[slotIdx];
  marble.flyTo(target.x, target.y, 250, 'Quad.easeOut', () => {
    // ④ 入位完成后触发匹配评估
    this.evaluateMatching();
  });
}

_handleOverflow(marble) {
  // 弹珠到达入口但队列已满 → Game Over
  marble.state = 'exiting';
  
  // 视觉：原地震动 + 变红 + 销毁
  this.scene.tweens.add({
    targets: marble.sprite,
    x: marble.sprite.x + Phaser.Math.Between(-5, 5),
    duration: 50,
    repeat: 4,
    yoyo: true,
    onComplete: () => {
      marble.destroy();
    }
  });
  
  // 数据：触发 Game Over 事件（一次性）
  if (!this._overflowFired) {
    this._overflowFired = true;
    this.scene.events.emit('queue-overflow');
  }
}
```

**注意 `_overflowFired` flag**：玩家点了一个方块产生 6 颗弹珠，6 颗都会试图入队，避免触发 6 次 GameOver。

### A.3 evaluateMatching：核心匹配引擎

这是 Gemini 强调的"必须频繁调用"的函数。我们的版本：

```javascript
/**
 * 扫描整个队列，把每颗匹配 tray 的弹珠送出去。
 * 同步阶段：更新所有数据状态，决定哪些弹珠要走、走去哪、之后队列怎么排
 * 异步阶段：触发视觉动画
 *
 * 调用时机：
 *   1. 一颗弹珠的 enqueue 动画完成时
 *   2. 一个 Tray 完成时（保险，应对未来的联动机制）
 *   3. Magnet 触发后
 *
 * 重入安全：可以在动画进行中再次被调用，因为数据状态已经在上一次调用时同步更新好了
 */
evaluateMatching() {
  // ===== 同步阶段：决策 =====
  
  const consumed = [];       // 本轮要消除的弹珠
  
  // Tray 的"未来 count"：考虑还在飞行中的弹珠占的位
  const trayFutureCount = new Map();
  this.trays.forEach(t => trayFutureCount.set(t, t.current_count));
  
  // 从左到右遍历队列
  for (let i = 0; i < this.marbles.length; i++) {
    const m = this.marbles[i];
    if (m.state !== 'queued') continue;  // 防御性
    
    // 找第一个未满的同色 Tray
    const tray = this.trays.find(t =>
      t.color === m.color && trayFutureCount.get(t) < t.capacity
    );
    
    if (tray) {
      consumed.push({ marble: m, tray });
      trayFutureCount.set(tray, trayFutureCount.get(tray) + 1);
      // ⚠ 不要在这里 splice，循环还在跑
    }
  }
  
  if (consumed.length === 0) return;
  
  // 一次性同步：从数组移除，更新 tray count
  consumed.forEach(({ marble, tray }) => {
    marble.state = 'flying-to-tray';
    const idx = this.marbles.indexOf(marble);
    if (idx !== -1) this.marbles.splice(idx, 1);
    tray.current_count += 1;  // 数据层立即 +1，但 UI count 在动画结束才更新
  });
  
  // 重新分配 slotIndex
  this.marbles.forEach((m, i) => { m.slotIndex = i; });
  
  // ===== 异步阶段：视觉 =====
  
  // 1. 消除动画
  consumed.forEach(({ marble, tray }, i) => {
    // 错峰，避免一坨弹珠同时飞同一个 Tray 的不同槽
    this.scene.time.delayedCall(i * 60, () => {
      const slot = tray.reserveAndGetNextSlotPosition();
      marble.flyTo(slot.x, slot.y, 350, 'Cubic.easeOut', () => {
        tray.fillVisualSlot(marble);  // 视觉填入 + 弹珠销毁
        marble.destroy();
        // 完成检测在 fillVisualSlot 内部触发
      });
    });
  });
  
  // 2. 左移补位动画（剩余弹珠平滑滑到新槽位）
  this.marbles.forEach((m, i) => {
    const target = this.slotPositions[i];
    if (Math.abs(m.sprite.x - target.x) > 1) {
      m.flyTo(target.x, target.y, 150, 'Sine.easeOut');
    }
  });
}
```

**为什么用 "trayFutureCount" Map？**

考虑这个场景：队列里 [pink, pink, pink]，pink Tray 还差 2 个就满。如果不用 future count，遍历时会发现"3 颗 pink 都匹配"，结果 3 颗都飞过去，但 Tray 只能装 2 个。

用 future count：第一次找到匹配后，把这个 tray 的"占位"+1 到 future map，下次循环检查时已经看到它"快满了"。

### A.4 removeMarble（被磁铁等外部系统调用）

```javascript
/**
 * 外部系统（如 Magnet）从队列中强制移除一颗弹珠时调用。
 * 仅做数据移除 + 槽位重排，视觉动画由调用方负责。
 */
removeMarble(marble) {
  const idx = this.marbles.indexOf(marble);
  if (idx === -1) return;
  this.marbles.splice(idx, 1);
  this.marbles.forEach((m, i) => { m.slotIndex = i; });
  
  // 触发左移
  this.marbles.forEach((m, i) => {
    const target = this.slotPositions[i];
    if (Math.abs(m.sprite.x - target.x) > 1) {
      m.flyTo(target.x, target.y, 150, 'Sine.easeOut');
    }
  });
}
```

---

## 模块 B：Tray 的精化实现

### B.1 数据 / 视觉双计数

Tray 维护两个 count：

```javascript
class Tray {
  constructor(scene, x, y, color, capacity) {
    // ...
    this.current_count = 0;       // 数据层：包含正在飞行中的（已 reserve 的）
    this.visual_filled = 0;       // 视觉层：实际显示在槽位里的
    this.reserved_slots = [];     // 已 reserve 但还没填的槽位索引
    this.isCompleted = false;
  }
  
  /**
   * 立即占据下一个槽位，返回坐标。同步调用，不触发动画。
   * 由 Queue.evaluateMatching 在数据更新阶段调用。
   */
  reserveAndGetNextSlotPosition() {
    const idx = this.current_count + this.reserved_slots.length;
    // 注：current_count 在 Queue.evaluateMatching 里已经 +1，
    // reserved_slots 跟踪还没视觉填入的占位
    // 实际的槽位索引 = visual_filled + reserved_slots.length
    const slotIdx = this.visual_filled + this.reserved_slots.length;
    this.reserved_slots.push(slotIdx);
    return this._slotIndexToWorldPos(slotIdx);
  }
  
  /**
   * 视觉填入。在弹珠飞抵动画的 onComplete 里调用。
   */
  fillVisualSlot(marble) {
    this.visual_filled += 1;
    this.reserved_slots.shift();  // 出队第一个 reservation
    
    // 在槽位里画一个该色小圆（持久化的视觉填充）
    this._renderFilledSlot(this.visual_filled - 1, marble.color);
    
    // 视觉反馈
    this._playFillFeedback();
    
    // 完成检查
    if (this.visual_filled >= this.capacity && !this.isCompleted) {
      this._onComplete();
    }
  }
  
  _slotIndexToWorldPos(slotIdx) {
    const col = slotIdx % 3;
    const row = Math.floor(slotIdx / 3);
    return {
      x: this.x - 40 + col * 40,
      y: this.y - 20 + row * 40
    };
  }
  
  isFull() {
    // 注意：这里应该看 current_count（含 reserved），不是 visual_filled
    // 否则 evaluateMatching 会把多余的弹珠也派过来
    return this.current_count >= this.capacity;
  }
  
  _onComplete() {
    this.isCompleted = true;
    // 弹跳 + 闪光（具体动画在 Task 07 完善）
    this.scene.tweens.add({
      targets: this.container,
      scale: { from: 1.15, to: 1 },
      duration: 250,
      ease: 'Back.easeOut'
    });
    this.scene.cameras.main.shake(120, 0.005);
    this.scene.events.emit('tray-completed', this);
  }
  
  _playFillFeedback() {
    // 每次填入弹珠的小反馈
    this.scene.tweens.add({
      targets: this.container,
      scale: { from: 1.05, to: 1 },
      duration: 150
    });
  }
}
```

### B.2 完成判定与胜利触发

```javascript
// GameScene 监听
this.events.on('tray-completed', (tray) => {
  // 多次评估机会（应对 magnet 等）
  this.queue.evaluateMatching();
  this._checkVictory();
});

_checkVictory() {
  const allDone = this.trays.every(t => t.isCompleted);
  if (allDone) {
    this.time.delayedCall(600, () => {
      this.scene.start('GameOverScene', { 
        result: 'win', 
        levelId: this.levelId 
      });
    });
  }
}
```

---

## 模块 C：Marble 的状态扩展

补充 Marble 类，增加 state 字段和 flyTo 的 ease 支持：

```javascript
class Marble {
  constructor(scene, x, y, color) {
    // ... 现有代码
    this.state = 'created';  // created | falling | queued | flying-to-tray | flying-to-magnet | exiting | destroyed
    this.slotIndex = -1;
  }
  
  flyTo(targetX, targetY, duration, ease = 'Cubic.easeOut', onComplete = null) {
    this.scene.tweens.add({
      targets: this.sprite,
      x: targetX,
      y: targetY,
      duration,
      ease,
      onComplete
    });
  }
  
  destroy() {
    this.state = 'destroyed';
    if (this.sprite && !this.sprite.destroyed) {
      this.sprite.destroy();
    }
  }
}
```

---

## 边界情况测试矩阵

实现完成后必须测过这些场景：

| # | 场景 | 期望结果 |
|---|---|---|
| 1 | 队列空时连点 6 个同色方块（36 颗弹珠） | 第 13 颗弹珠（超 capacity=12）触发 GameOver，前 12 颗正常入队 |
| 2 | 队列里 [pink, pink, pink]，pink tray 差 2 满 | 前 2 颗 pink 飞向 tray，第 3 颗留在队列；不会有 3 颗都飞过去 |
| 3 | 玩家点击节奏快到 100ms 一次 | 不丢弹珠，不重叠，所有弹珠最终归位 |
| 4 | 一颗弹珠飞向 tray 的途中，玩家点了新方块 | 队列正确空出位置给新弹珠 |
| 5 | Tray 完成的瞬间，队列里恰好还有同色弹珠 | 该弹珠不会飞去已满 tray，留在队列 |
| 6 | 磁铁触发，吸取队列里所有 blue | 队列正确左移，blue tray（如有）正确填充 |
| 7 | Game Over 弹窗触发后玩家继续点击 | 点击无响应（GameScene 应在 overflow 时禁用输入） |

## Game Scene 输入禁用

```javascript
// GameScene
this.events.on('queue-overflow', () => {
  this._inputLocked = true;
  // 所有 Block 的 setInteractive 失效
  this.blocks.forEach(b => b.container.disableInteractive?.());
  this.scene.time.delayedCall(800, () => {
    this.scene.start('GameOverScene', { result: 'lose', levelId: this.levelId });
  });
});
```

---

## 需要在 Task 02 代码上做的改动汇总

如果 Task 02 已经实现，按以下顺序回填：

1. **Queue.js**
   - `_tryClear()` → 重命名并重写为 `evaluateMatching()`
   - `enqueue()` 增加 overflow 处理（`_handleOverflow` + `_overflowFired` flag）
   - 增加 `removeMarble(marble)` 公开方法
2. **Tray.js**
   - 增加 `current_count` 和 `visual_filled` 双计数
   - 把原来的 `addMarble` 拆成 `reserveAndGetNextSlotPosition` + `fillVisualSlot`
   - `isFull()` 用 `current_count`
3. **Marble.js**
   - `flyTo` 签名加 `ease` 参数（默认 `Cubic.easeOut`）
   - 增加 `state` 字段 + `slotIndex` 字段
4. **GameScene.js**
   - 监听 `queue-overflow`，加 `_inputLocked`
   - 监听 `tray-completed`，再次调用 `evaluateMatching` + `_checkVictory`
5. **Magnet.js**（如果 Task 05 已完成）
   - 把 `queue._removeMarble(marble)` 改成 `queue.removeMarble(marble)`（公开 API）

---

## 验收标准

- [ ] 边界场景表 1-7 全部通过
- [ ] Console 在所有边界场景下零 warning / error
- [ ] 用 `console.log(queue.marbles.length, queue.marbles.map(m => m.state))` 在每次操作后打印，确认数据状态干净
- [ ] 视觉上没有任何弹珠重叠在同一槽位
- [ ] 视觉上没有任何弹珠飞出屏幕外（除了 magnet 主动外飞）
- [ ] 快速点击 5 秒后停止，所有弹珠都到达正确位置（队列槽 / tray 槽 / 销毁）

---

## Agent Prompt（直接复制给 Codex）

```
You are refining the Queue and Tray logic for "Marble Sort!" per 02b_QUEUE_TRAY_LOGIC.md.

Read 00_MASTER_SPEC.md, 02_CORE_GAMEPLAY.md, and (if applicable) 05_MAGNET.md first.

Task 02 has implemented a working version. This task replaces specific functions with more robust versions that decouple synchronous data updates from asynchronous visual tweens. The motivation is to eliminate race conditions during rapid input, magnet activation, and tray completion.

CRITICAL ARCHITECTURAL RULE:
> When a marble matches a tray, update the queue array AND tray count IMMEDIATELY in memory. THEN trigger visual tweens. NEVER wait for animation onComplete to update array indices.

Strict rules:
- Do NOT change the public API of Queue or Tray that other systems (Magnet, GravityFlip, GameScene) depend on. Specifically: Queue.enqueue, Tray.isFull, the 'queue-overflow' and 'tray-completed' events.
- The new public method Queue.removeMarble (replacing the old _removeMarble) should be the ONLY way external systems mutate the queue array.
- Marble must gain a `state` field. Use it defensively in evaluateMatching (skip non-'queued' marbles).
- Tray's `current_count` is the data-truth (includes in-flight marbles). `visual_filled` is just for rendering.
- Use the future-count Map technique in evaluateMatching to prevent over-assigning marbles to a near-full tray.

Tasks in order:
1. Update Marble.js: add state field, slotIndex field, flyTo signature with ease param
2. Rewrite Queue.js: rename _tryClear → evaluateMatching with the future-count algorithm; add proper overflow handling with _overflowFired flag; add public removeMarble
3. Update Tray.js: split addMarble into reserveAndGetNextSlotPosition + fillVisualSlot; introduce current_count vs visual_filled
4. Update GameScene.js: input lock on overflow; re-evaluate matching on tray-completed
5. Update Magnet.js (if exists): use the new public removeMarble API; ensure it sets marble.state = 'flying-to-magnet' before the tween
6. Run all 7 boundary scenarios in section "边界情况测试矩阵" and report results
7. Add a debug overlay (toggleable with key 'D') showing queue.marbles.length and each tray's current_count vs visual_filled — this helps verify the data/visual decoupling

DO NOT introduce Matter.js. DO NOT change the level JSON schema.

Deliver:
1. Updated Queue.js, Tray.js, Marble.js, GameScene.js, Magnet.js (if exists)
2. Test report against the 7 boundary scenarios
3. Brief code comment at the top of evaluateMatching explaining the sync/async split
```
