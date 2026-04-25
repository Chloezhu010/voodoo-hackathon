# Task 02 — 核心玩法（棋盘 + 点击 + 队列 + 托盘）

> **优先级**：P0（gate，最关键的一个任务）
> **预计工时**：6-8 小时
> **依赖**：Task 01
> **执行前必读**：`00_MASTER_SPEC.md`
>
> **⚠ 配套精化**：本任务实现一版可工作的核心循环。完成后**必须接 `02b_QUEUE_TRAY_LOGIC.md`** 把 Queue 和 Tray 的同步/异步逻辑做严密。02b 主要替换 `_tryClear` 和 `addMarble` 这两块，是 P0 稳定性的最后一块拼图。

## 任务目标

实现 GameScene 的完整核心循环：从 JSON 加载关卡 → 渲染棋盘 → 处理点击 → 弹珠掉落 → 队列管理 → 托盘消除 → 胜利/失败判定。

**这是整个项目的心脏。**所有视觉打磨和创新机制都建立在这之上。完成度优先于花哨度。

## 核心循环回顾（再读一遍）

```
点击未遮挡方块 → 方块碎裂成6颗弹珠 → 弹珠依次进入队列轨道
   ↓
队列中弹珠颜色匹配 Tray → 飞向 Tray → Tray +1
   ↓
所有 Tray 集齐6颗 → 关卡通过
[失败] 队列容量满 → Game Over
```

## 详细规格

### 1. 文件清单

```
src/
├── scenes/
│   ├── GameScene.js          # 主场景
│   └── GameOverScene.js      # 胜利/失败弹窗
├── entities/
│   ├── Block.js              # 方块类
│   ├── Marble.js             # 弹珠类
│   ├── Queue.js              # 队列管理器
│   ├── Tray.js               # 目标托盘
│   └── Funnel.js             # 漏斗（视觉装饰）
├── systems/
│   ├── BoardManager.js       # 棋盘逻辑（遮挡判定）
│   └── LevelLoader.js        # 关卡加载
└── levels/
    └── level_test.json       # 临时测试关卡
```

### 2. 临时测试关卡（先创建这个用于联调）

`src/levels/level_test.json`：
```json
{
  "level_id": 0,
  "name": "Test",
  "board_size": { "cols": 5, "rows": 5 },
  "blocks": [
    { "id": "b1", "col": 1, "row": 1, "z": 0, "color": "pink", "is_hidden": false },
    { "id": "b2", "col": 2, "row": 1, "z": 0, "color": "pink", "is_hidden": false },
    { "id": "b3", "col": 3, "row": 1, "z": 0, "color": "blue", "is_hidden": false },
    { "id": "b4", "col": 1, "row": 2, "z": 0, "color": "blue", "is_hidden": false },
    { "id": "b5", "col": 2, "row": 2, "z": 0, "color": "green", "is_hidden": false },
    { "id": "b6", "col": 3, "row": 2, "z": 0, "color": "green", "is_hidden": false }
  ],
  "trays": [
    { "color": "pink", "capacity": 6 },
    { "color": "blue", "capacity": 6 },
    { "color": "green", "capacity": 6 }
  ],
  "queue_capacity": 12,
  "gravity_flip_enabled": false,
  "magnet_count": 0
}
```

### 3. Block 类（src/entities/Block.js）

```javascript
// 数据 + 视觉一体的方块对象
class Block {
  constructor(scene, data) {
    this.scene = scene;
    this.data = data;  // { id, col, row, z, color, is_hidden }
    this.isCovered = false;  // 由 BoardManager 计算
    this.isCleared = false;
    this.container = scene.add.container(x, y);  // 容器装载视觉元素
    this.render();
    this.setupInteraction();
  }
  
  render() {
    // 用 Graphics 画一个 Pop-it 风格的圆角方块
    // 底色：根据 color 取 COLORS[color].hex
    // 中央有一个内凹小圆（模拟 Pop-it 触感）
    // 如果 is_hidden 且 isCovered → 显示灰色 + "?"
    // 如果 is_hidden 且 !isCovered → 揭示真实颜色（加一个小翻转动画）
    // 如果 isCovered 且 !is_hidden → 加一个深色蒙版
  }
  
  setupInteraction() {
    // 只有 !isCovered && !isCleared 才响应点击
    // 点击时 emit 'block-tapped' 事件，参数 this
    // hover 时缩放 1.08
  }
  
  shatter() {
    // 视觉：方块缩小消失，触发粒子（粒子留给 Task 07，这里先用简单的 fade out）
    // 触发 onShatter 回调，由 GameScene 接管生成弹珠
    this.isCleared = true;
  }
}
```

**Pop-it 风格画法（Graphics 代码）**：
```javascript
const g = scene.add.graphics();
g.fillStyle(colorHex, 1);
g.fillRoundedRect(-48, -48, 96, 96, 16);
// 内圈高光
g.fillStyle(0xffffff, 0.3);
g.fillCircle(0, 0, 24);
// 内圈阴影
g.lineStyle(3, 0x000000, 0.2);
g.strokeCircle(0, 0, 24);
```

### 4. BoardManager（src/systems/BoardManager.js）

负责计算方块之间的遮挡关系。

**遮挡规则**（关键，仔细读）：

- 两个方块**同一格** (col, row 相同) 时，z 大的遮挡 z 小的
- z 大的方块完全可点击；z 小的被遮挡
- **不考虑跨格遮挡**（简化模型，30 小时不做透视投影）

```javascript
class BoardManager {
  constructor(blocks) {
    this.blocks = blocks;  // Block 实例数组
    this.recomputeCoverage();
  }
  
  recomputeCoverage() {
    // 对每个 cell (col,row)，找到所有方块按 z 排序
    // z 最大的 isCovered = false，其余 isCovered = true
    // 同时：如果一个 is_hidden 方块的 isCovered 从 true 变 false，触发它的 reveal 动画
  }
  
  onBlockCleared(block) {
    block.isCleared = true;
    this.recomputeCoverage();
  }
  
  isLevelComplete() {
    return this.blocks.every(b => b.isCleared);
  }
}
```

### 5. Marble 类（src/entities/Marble.js）

```javascript
class Marble {
  constructor(scene, x, y, color) {
    this.scene = scene;
    this.color = color;
    this.sprite = scene.add.graphics();
    this.sprite.fillStyle(COLORS[color].hex, 1);
    this.sprite.fillCircle(0, 0, 14);
    // 高光
    this.sprite.fillStyle(0xffffff, 0.4);
    this.sprite.fillCircle(-4, -4, 5);
    this.sprite.x = x;
    this.sprite.y = y;
    this.state = 'falling';  // falling | queued | flying-to-tray | cleared
  }
  
  flyTo(targetX, targetY, duration, onComplete) {
    this.scene.tweens.add({
      targets: this.sprite,
      x: targetX,
      y: targetY,
      duration,
      ease: 'Cubic.easeOut',
      onComplete
    });
  }
  
  destroy() {
    this.sprite.destroy();
  }
}
```

### 6. Funnel 类（src/entities/Funnel.js）

**纯视觉装饰**，不参与物理。

- 在 `CONFIG.FUNNEL_AREA` 区域画一个梯形漏斗（用 Graphics）
- 上宽下窄，半透明灰色
- 不响应任何事件

### 7. 弹珠掉落动画（确定性掉落，关键决策）

点击方块后，生成 6 颗弹珠的动画序列：

```javascript
function shatterAndFall(block) {
  block.shatter();
  
  // 6 颗弹珠以 80ms 间隔依次生成
  for (let i = 0; i < 6; i++) {
    scene.time.delayedCall(i * 80, () => {
      const startX = block.x + Phaser.Math.Between(-30, 30);  // 微抖动
      const startY = block.y;
      const marble = new Marble(scene, startX, startY, block.data.color);
      
      // 第一段：从方块位置掉到漏斗入口
      const funnelEntryX = CONFIG.FUNNEL_AREA.x + CONFIG.FUNNEL_AREA.width / 2;
      const funnelEntryY = CONFIG.FUNNEL_AREA.y;
      
      marble.flyTo(funnelEntryX, funnelEntryY, 400, () => {
        // 第二段：从漏斗滑到队列下一个空位
        queue.enqueue(marble);
      });
    });
  }
}
```

**注意**：
- 不要用真实物理（不开 gravity）。用 Tween 的 `Cubic.easeIn` 模拟下落感即可
- 6 颗弹珠的微抖动让视觉不死板
- 80ms 间隔避免一坨弹珠同时出现

### 8. Queue（src/entities/Queue.js）—— 这是逻辑核心

```javascript
class Queue {
  constructor(scene, capacity, trays) {
    this.scene = scene;
    this.capacity = capacity;
    this.trays = trays;        // Tray 实例数组
    this.marbles = [];         // 已入队的弹珠数组（有序）
    this.slotPositions = this._computeSlotPositions();
  }
  
  _computeSlotPositions() {
    // 在 CONFIG.QUEUE_AREA 范围内均分 capacity 个槽位
    const positions = [];
    const startX = CONFIG.QUEUE_AREA.x + 30;
    const stepX = (CONFIG.QUEUE_AREA.width - 60) / (this.capacity - 1);
    const y = CONFIG.QUEUE_AREA.y + CONFIG.QUEUE_AREA.height / 2;
    for (let i = 0; i < this.capacity; i++) {
      positions.push({ x: startX + i * stepX, y });
    }
    return positions;
  }
  
  enqueue(marble) {
    if (this.marbles.length >= this.capacity) {
      // 队列满，触发失败
      this.scene.events.emit('queue-overflow');
      marble.destroy();
      return;
    }
    
    const slotIdx = this.marbles.length;
    this.marbles.push(marble);
    marble.state = 'queued';
    
    const target = this.slotPositions[slotIdx];
    marble.flyTo(target.x, target.y, 300, () => {
      this._tryClear();
    });
  }
  
  _tryClear() {
    // 检查队列里每颗弹珠：是否有匹配的未满 Tray？
    // 如果有，让它飞到 Tray，然后从队列移除
    // 移除后，后面的弹珠左移补位（用 Tween）
    
    let cleared = false;
    for (let i = 0; i < this.marbles.length; i++) {
      const marble = this.marbles[i];
      if (marble.state !== 'queued') continue;
      
      const tray = this.trays.find(t => 
        t.color === marble.color && !t.isFull()
      );
      
      if (tray) {
        marble.state = 'flying-to-tray';
        const targetSlot = tray.getNextSlotPosition();
        marble.flyTo(targetSlot.x, targetSlot.y, 400, () => {
          tray.addMarble(marble);
          this._removeMarble(marble);
        });
        cleared = true;
        break;  // 一次只处理一颗，避免连锁飞行混乱
      }
    }
    
    if (cleared) {
      // 略微延时再次尝试，处理后续可能的连锁清除
      this.scene.time.delayedCall(150, () => this._tryClear());
    }
  }
  
  _removeMarble(marble) {
    const idx = this.marbles.indexOf(marble);
    if (idx === -1) return;
    this.marbles.splice(idx, 1);
    
    // 后面的弹珠左移到新槽位
    for (let i = idx; i < this.marbles.length; i++) {
      const m = this.marbles[i];
      const target = this.slotPositions[i];
      m.flyTo(target.x, target.y, 200);
    }
  }
}
```

### 9. Tray（src/entities/Tray.js）

```javascript
class Tray {
  constructor(scene, x, y, color, capacity) {
    this.scene = scene;
    this.color = color;
    this.capacity = capacity;
    this.filled = 0;
    this.marbles = [];
    this.x = x;
    this.y = y;
    this.render();
  }
  
  render() {
    // 画一个 Pop-it 方块底座（颜色 = 该 tray 颜色但低饱和度）
    // 上面画 6 个空圆位（capacity 个槽）
    // 槽位 2 行 3 列排布
  }
  
  getNextSlotPosition() {
    // 返回下一个空槽位的世界坐标
    const idx = this.filled;
    const col = idx % 3;
    const row = Math.floor(idx / 3);
    return {
      x: this.x - 40 + col * 40,
      y: this.y - 20 + row * 40
    };
  }
  
  addMarble(marble) {
    this.marbles.push(marble);
    this.filled++;
    
    // 弹跳动画反馈
    this.scene.tweens.add({
      targets: this.container,
      scale: { from: 1.1, to: 1 },
      duration: 200,
      ease: 'Back.easeOut'
    });
    
    if (this.isFull()) {
      this._onComplete();
    }
  }
  
  _onComplete() {
    // Tray 集齐时变金 + 闪光
    // emit 'tray-completed'
  }
  
  isFull() {
    return this.filled >= this.capacity;
  }
}
```

### 10. GameScene 主流程（src/scenes/GameScene.js）

```javascript
class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }
  
  init(data) {
    this.levelId = data.levelId || 0;
  }
  
  preload() {
    this.load.json('level', `src/levels/level_${pad(this.levelId)}.json`);
  }
  
  create() {
    const levelData = this.cache.json.get('level');
    
    // 1. 渲染背景区域分隔
    this._drawAreas();
    
    // 2. 创建漏斗
    this.funnel = new Funnel(this);
    
    // 3. 创建托盘
    this.trays = levelData.trays.map((t, i) => {
      const x = CONFIG.TRAY_AREA.x + 90 + i * 130;
      const y = CONFIG.TRAY_AREA.y + 100;
      return new Tray(this, x, y, t.color, t.capacity);
    });
    
    // 4. 创建队列
    this.queue = new Queue(this, levelData.queue_capacity, this.trays);
    
    // 5. 创建方块
    this.blocks = levelData.blocks.map(d => new Block(this, d));
    this.boardManager = new BoardManager(this.blocks);
    
    // 6. 监听事件
    this.events.on('block-tapped', this._onBlockTapped, this);
    this.events.on('queue-overflow', this._onGameOver, this);
    this.events.on('tray-completed', this._checkVictory, this);
    
    // 7. 顶部 HUD（关卡号 + 返回按钮）
    this._drawHUD();
  }
  
  _onBlockTapped(block) {
    if (block.isCovered || block.isCleared) return;
    
    // 碎裂
    block.shatter();
    this.boardManager.onBlockCleared(block);
    
    // 6 颗弹珠依次掉落
    for (let i = 0; i < 6; i++) {
      this.time.delayedCall(i * 80, () => {
        const marble = new Marble(this, 
          block.container.x + Phaser.Math.Between(-30, 30), 
          block.container.y, 
          block.data.color
        );
        const funnelX = CONFIG.FUNNEL_AREA.x + CONFIG.FUNNEL_AREA.width / 2;
        const funnelY = CONFIG.FUNNEL_AREA.y + CONFIG.FUNNEL_AREA.height;
        marble.flyTo(funnelX, funnelY, 500, () => {
          this.queue.enqueue(marble);
        });
      });
    }
  }
  
  _checkVictory() {
    if (this.trays.every(t => t.isFull())) {
      this.scene.start('GameOverScene', { result: 'win', levelId: this.levelId });
    }
  }
  
  _onGameOver() {
    this.scene.start('GameOverScene', { result: 'lose', levelId: this.levelId });
  }
}
```

### 11. GameOverScene（src/scenes/GameOverScene.js）

最简版本（视觉打磨在 Task 07）：
- 半透明黑色蒙版
- 居中显示 "LEVEL CLEAR!" 或 "OUT OF SPACE!"
- 两个按钮：RETRY / MENU
- RETRY 重新进入 GameScene 同关卡
- MENU 回 LevelSelectScene

## 验收标准

加载 `level_test.json`，应该能：

- [ ] 看到 6 个方块整齐排列在棋盘区
- [ ] 底部看到 3 个空托盘（粉/蓝/绿）
- [ ] 中间看到漏斗 + 队列轨道（视觉上能识别）
- [ ] 点击粉色方块：方块消失 + 6 颗粉色弹珠依次掉到漏斗，再排到队列
- [ ] 弹珠在队列中**立即**飞向粉色托盘，托盘填满 6 个粉点
- [ ] 同理可清绿色和蓝色
- [ ] 全部托盘集齐 → 跳转 GameOver 显示 "LEVEL CLEAR"
- [ ] 故意点很多色（凑出超过 12 颗滞留）→ 触发 OUT OF SPACE
- [ ] 没有 console error，没有 NaN，没有弹珠飞出屏幕

## 关键避坑

1. **不要给弹珠开 Arcade 物理体**。用 Tween 控制位置就行。开了物理后弹珠会互相碰撞，调参成本极高
2. **Tray 的颜色顺序在 trays 数组里就是显示顺序**，不要按字母排序
3. **`_tryClear` 一次只处理一颗弹珠**，否则同时多颗飞向同一 Tray 槽位会重叠
4. **Block 的点击区域** 用 `setInteractive(new Phaser.Geom.Rectangle(...), Phaser.Geom.Rectangle.Contains)`，确保被遮挡时不响应
5. **隐藏方块揭示**：当 `BoardManager.recomputeCoverage()` 发现某个 hidden 方块从 covered 变成 uncovered，调用它的 `reveal()` 方法播翻转动画

## Agent Prompt（直接复制给 Codex）

```
You are implementing the core gameplay loop for "Marble Sort!" — a browser puzzle game for the Voodoo Game Jam.

Read 00_MASTER_SPEC.md and 01_SCAFFOLD.md first. The scaffolding is already done. Now implement Task 02 per 02_CORE_GAMEPLAY.md.

This is the most critical task. Prioritize correctness over polish — visuals will be improved in Task 07.

Strict rules:
- DO NOT use Matter.js. Use Phaser Tweens for marble movement, no physics bodies on marbles.
- DO NOT make _tryClear process multiple marbles in parallel — one at a time with delayedCall.
- All blocks/marbles/trays drawn with Phaser.Graphics, no image assets.
- The level_test.json provided in section 2 must work end-to-end before you consider this task done.

Deliver in this order:
1. Block.js + Marble.js + Funnel.js (entities first)
2. BoardManager.js + LevelLoader.js (systems)
3. Queue.js + Tray.js (the logic core)
4. GameScene.js (wiring)
5. GameOverScene.js (minimal version)
6. level_test.json
7. Manual test report against the acceptance checklist
```
