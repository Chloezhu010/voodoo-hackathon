# Task 02c — 循环传送带 + 列式收集箱（新核心架构）

> **优先级**：P0（gate，最关键的一个任务，替代原 02b）
> **预计工时**：6-8 小时（在已完成的 00-04 + Pointer Hit Zone bugfix 基础上重构）
> **依赖**：00-04 已完成
> **执行前必读**：`00_MASTER_SPEC.md`, `02_CORE_GAMEPLAY.md`（部分仍有效）, 已经完成的 hit zone bugfix 文档

## 这份 spec 的目的

替换原静态 Queue + 静态 Tray 的核心循环，改为**循环传送带 + 列式收集箱**机制。这是 Voodoo Track 1 的 Creativity 主押注点：把 Marble Sort 的"分档收集"和 Beads Out / Sand Loop 的"传送带循环"融合成一种 reference 都没有的玩法。

## 重要变更摘要（给执行 Agent 的快速概览）

```
旧 (Task 02 + 02b)                       新 (Task 02c)
─────────────────────────────────────────────────────────────
Block (6 颗弹珠)         →                Block (9 颗弹珠)
  ↓                                         ↓
Funnel (视觉)            =不变=            Funnel (视觉)
  ↓                                         ↓
Queue (12 槽 + 静态)     →                Conveyor (24 槽 + 循环)
  ↓                                         ↓ 转一圈
Tray (静态 6 槽)         →                OutputPort × 4 + BoxColumn × 4
                                            ↓ 顶层箱满 3 → 消失 + 上移
                                            (所有箱清空 = 胜利)
```

**保留不动的代码（Codex 必须复用）**：
- `Block.js`（包括 hitZone 系统）
- `BoardManager.js`
- `Funnel.js`（视觉漏斗保留，弹珠从这里掉到传送带上层入口）
- 所有 Scene 导航（MenuScene / LevelSelectScene / EditorScene / GameOverScene 的非游戏部分）
- 关卡 JSON 加载器、`/src/levels/*.json` 文件**结构**保留（字段会变，schema 不变）
- `/src/ui/hitZones.js`（继续给所有可点击对象用）
- 所有 03 / 04 的现有代码（除了 GameScene 的中段）

**全部废弃的代码（Codex 必须删）**：
- `Queue.js`（整个文件删除）
- `Tray.js`（整个文件删除）
- `Marble.js` 内的旧 state 枚举值需要更新

**新建的代码**：
- `src/entities/Conveyor.js`
- `src/entities/OutputPort.js`
- `src/entities/Box.js`
- `src/entities/BoxColumn.js`
- `src/systems/ConveyorTrack.js`（参数化轨迹数学，独立可测）

---

## 1. 核心循环（必须默念一遍）

```
玩家点击未遮挡的方块
   ↓
方块碎裂成 9 颗弹珠
   ↓
弹珠从方块位置掉到 Funnel 入口（Tween，450ms）
   ↓
Funnel 把弹珠"导入"传送带的上层最左槽位
   ↓
弹珠在传送带上沿固定速度循环（上层左→右，弧形过渡，下层右→左，弧形过渡）
   ↓
传送带下层底面有 4 个 OutputPort
   ↓
弹珠转到某个 OutputPort 正上方时：
  - 检查该 Port 对应 BoxColumn 的顶层 Box
  - 如果顶层 Box 颜色匹配弹珠颜色 → 弹珠掉下去
  - 否则弹珠继续转
   ↓
顶层 Box 装满 3 个 → 整个 Box 消失（粒子爆炸）→ 下方所有 Box 上移一格
   ↓
所有 Column 都空了 → 关卡通过

[失败] 任意时刻传送带上弹珠总数 ≥ 24 时，新弹珠塞不进 → Game Over
```

---

## 2. 关卡 JSON Schema 变更

### 2.1 字段变更对照

| 字段 | 旧 | 新 | 说明 |
|---|---|---|---|
| `marbles_per_block` | 隐式 6 | **显式 9** | 改为常量配置在 master spec 里 |
| `queue_capacity` | 12 | ❌ 删除 | 替换为传送带容量 |
| `conveyor_capacity` | - | **24** | 全局固定，不写入关卡也行 |
| `conveyor_speed` | - | **0.04 ~ 0.10** | 一圈耗时 = 1/speed 秒，关卡参数 |
| `trays` | 数组 | ❌ 删除 | 替换为 box_columns |
| `box_columns` | - | **新增** | 见 2.2 |
| `output_ports` | - | **可选** | 默认 4 列等距分布；编辑器允许调整 |
| `gravity_flip_enabled` | bool | =不变= | 06 任务用 |
| `magnet_count` | int | =不变= | 05 任务用 |

### 2.2 box_columns 结构

```json
"box_columns": [
  {
    "col": 0,
    "boxes": ["pink", "blue", "yellow", "yellow"]
  },
  {
    "col": 1,
    "boxes": ["blue", "blue", "pink"]
  },
  {
    "col": 2,
    "boxes": ["green", "purple", "green", "blue"]
  },
  {
    "col": 3,
    "boxes": ["yellow", "purple", "pink"]
  }
]
```

**约定**：
- `boxes` 数组：**索引 0 是顶层**（最先接弹珠），最大索引是底层
- 每个 box 容量固定 3
- 列数固定 4（不可少，编辑器只允许 0-4 列有效）
- 总箱子数 = `Σ(boxes.length)`，必须满足：**`方块数 × 3 == 总箱子数`**（因为 方块×9 弹珠 = 箱子×3 容量）

### 2.3 关卡校验规则（编辑器和加载器都要做）

```javascript
function validateLevel(data) {
  // 1. 总弹珠 = 总箱容
  const totalMarbles = data.blocks.length * 9;
  const totalBoxCapacity = data.box_columns.reduce(
    (s, c) => s + c.boxes.length, 0
  ) * 3;
  if (totalMarbles !== totalBoxCapacity) {
    throw new Error(`Marble count (${totalMarbles}) ≠ box capacity (${totalBoxCapacity})`);
  }
  
  // 2. 颜色守恒：每种颜色的方块数 × 9 = 该颜色箱子数 × 3
  const blockColorCounts = countBy(data.blocks, b => b.color);
  const boxColorCounts = countBy(
    data.box_columns.flatMap(c => c.boxes), 
    color => color
  );
  for (const color in blockColorCounts) {
    const marbleCount = (blockColorCounts[color] || 0) * 9;
    const boxSlotCount = (boxColorCounts[color] || 0) * 3;
    if (marbleCount !== boxSlotCount) {
      throw new Error(`Color ${color}: ${marbleCount} marbles vs ${boxSlotCount} slots`);
    }
  }
  
  // 3. 列数为 4
  if (data.box_columns.length !== 4) {
    throw new Error(`Must have exactly 4 box columns, got ${data.box_columns.length}`);
  }
}
```

**这个校验是硬约束**：少一颗弹珠或多一颗弹珠都会让游戏永远不通关或弹珠掉到没箱子的地方。编辑器的 Play Test 必须先跑这个校验。

---

## 3. 全局配置常量更新

`src/config/constants.js` 增删字段：

```javascript
export const CONFIG = {
  // === 旧字段（保留不变） ===
  GAME_WIDTH: 720,
  GAME_HEIGHT: 1280,
  BLOCK_SIZE: 96,
  HEADER_HEIGHT: 80,
  BOARD_AREA: { x: 60, y: 120, width: 600, height: 540 },  // 略缩，给传送带让位
  FUNNEL_AREA: { x: 280, y: 670, width: 160, height: 60 },  // 略缩
  
  // === 新字段 ===
  MARBLES_PER_BLOCK: 9,                    // ⚠ 旧值 6，改成 9
  
  CONVEYOR: {
    AREA: { x: 40, y: 730, width: 640, height: 320 },
    SLOTS_PER_LAYER: 12,                  // 上层 12 + 下层 12 = 24
    TOTAL_CAPACITY: 24,
    DEFAULT_SPEED: 0.06,                  // 一圈约 16.7 秒
    UPPER_LAYER_Y_OFFSET: -100,           // 相对于 AREA 中心
    LOWER_LAYER_Y_OFFSET: +100,
    CORNER_RADIUS: 50,                    // 弧形过渡半径
  },
  
  OUTPUT_PORTS: {
    Y_OFFSET: 110,                         // 在传送带下层下方
    GAP_BETWEEN: 152,                      // 4 个等距口的间距
    PORT_WIDTH: 80,
    DETECT_EPSILON: 0.012,                 // 弹珠位于 outputT ± 这个范围内才触发掉落
  },
  
  BOX_COLUMNS: {
    AREA: { x: 40, y: 1080, width: 640, height: 180 },
    BOX_WIDTH: 100,
    BOX_HEIGHT: 50,
    BOX_GAP: 4,                            // 同列相邻箱子间距
    SLOT_RADIUS: 12,                       // 箱内显示弹珠的小圆半径
  },
  
  MARBLE_RADIUS: 14,
  MARBLE_FALL_DURATION: 450,              // 方块 → 漏斗
  MARBLE_TO_PORT_DURATION: 350,            // 漏斗 → 传送带入口
  MARBLE_PORT_DROP_DURATION: 350,          // 传送带 → 箱子
};
```

---

## 4. ConveyorTrack（参数化轨迹数学）

`src/systems/ConveyorTrack.js`——这是整个传送带的几何核心，**独立可单元测试**，不持有任何 Phaser 对象。

### 4.1 设计原理

弹珠在传送带上的位置用一个进度参数 `t ∈ [0, 1)` 表示。`t = 0` 是上层最左入口，顺着上层 → 右弧形过渡 → 下层 → 左弧形过渡 → 回到 t = 0。

轨迹分 4 段：

| 段 | t 区间 | 形状 | 描述 |
|---|---|---|---|
| 上层直线 | `[0.00, 0.40)` | 水平直线，从左到右 | 占总长 40% |
| 右弧形 | `[0.40, 0.50)` | 半圆，向下弯 | 占总长 10% |
| 下层直线 | `[0.50, 0.90)` | 水平直线，从右到左 | 占总长 40% |
| 左弧形 | `[0.90, 1.00)` | 半圆，向上弯 | 占总长 10% |

### 4.2 实现

```javascript
// src/systems/ConveyorTrack.js
import { CONFIG } from '../config/constants.js';

export class ConveyorTrack {
  constructor() {
    const C = CONFIG.CONVEYOR;
    this.cx = C.AREA.x + C.AREA.width / 2;
    this.cy = C.AREA.y + C.AREA.height / 2;
    
    this.leftX = C.AREA.x + C.CORNER_RADIUS;
    this.rightX = C.AREA.x + C.AREA.width - C.CORNER_RADIUS;
    this.topY = this.cy + C.UPPER_LAYER_Y_OFFSET;
    this.bottomY = this.cy + C.LOWER_LAYER_Y_OFFSET;
    this.r = C.CORNER_RADIUS;
  }
  
  /**
   * 把进度 t ∈ [0, 1) 映射到屏幕坐标 {x, y}
   */
  positionAt(t) {
    t = ((t % 1) + 1) % 1;  // 防负数
    
    if (t < 0.40) {
      // 上层：左 → 右
      const localT = t / 0.40;
      return {
        x: this.leftX + (this.rightX - this.leftX) * localT,
        y: this.topY
      };
    } else if (t < 0.50) {
      // 右弧形（顶部 → 底部，圆心在右侧）
      const localT = (t - 0.40) / 0.10;
      const angle = -Math.PI / 2 + Math.PI * localT;  // -90° → +90°
      return {
        x: this.rightX + this.r * Math.cos(angle),
        y: this.cy + this.r * Math.sin(angle)
      };
    } else if (t < 0.90) {
      // 下层：右 → 左
      const localT = (t - 0.50) / 0.40;
      return {
        x: this.rightX - (this.rightX - this.leftX) * localT,
        y: this.bottomY
      };
    } else {
      // 左弧形（底部 → 顶部，圆心在左侧）
      const localT = (t - 0.90) / 0.10;
      const angle = Math.PI / 2 + Math.PI * localT;  // +90° → +270° (= -90°)
      return {
        x: this.leftX + this.r * Math.cos(angle),
        y: this.cy + this.r * Math.sin(angle)
      };
    }
  }
  
  /**
   * 上层入口处的 t 值（弹珠从 funnel 进入传送带的位置）
   */
  get entryT() { return 0.0; }
  
  /**
   * 给定下层一个屏幕 X 坐标，返回对应的 t 值
   * 用于 OutputPort 在轨道上的定位
   */
  tForLowerLayerX(x) {
    // 下层是 0.50 ~ 0.90，x 从右往左
    const ratio = (this.rightX - x) / (this.rightX - this.leftX);
    const clamped = Math.max(0, Math.min(1, ratio));
    return 0.50 + clamped * 0.40;
  }
}
```

### 4.3 单元测试要求

实现 Codex 必须写一个简单的 console 测试（或者节点脚本），验证：

```
positionAt(0.0)  ≈ {leftX, topY}        (上层入口)
positionAt(0.40) ≈ {rightX, topY}       (上层右端)
positionAt(0.50) ≈ {rightX + r, cy}     (右弧形最右点)  
positionAt(0.90) ≈ {leftX, bottomY}     (下层左端)
positionAt(0.95) ≈ {leftX - r, cy}      (左弧形最左点)
```

---

## 5. Marble 类更新

`src/entities/Marble.js`：

```javascript
export class Marble {
  constructor(scene, x, y, color) {
    this.scene = scene;
    this.color = color;
    this.sprite = scene.add.graphics();
    this._render();
    this.sprite.x = x;
    this.sprite.y = y;
    
    // ⚠ 新状态机
    this.state = 'created';
    // 'created' → 'falling-to-funnel' → 'on-conveyor' → 'dropping-to-box' → 'in-box' → 'destroyed'
    // 也可能：'on-conveyor' → 'flying-to-magnet-target' → 'destroyed' (磁铁强制掉)
    // 也可能：'on-conveyor' → 'overflow-exit' → 'destroyed' (Game Over 时)
    
    this.t = -1;             // 在传送带上的进度，-1 表示还没上传送带
  }
  
  _render() { /* 同旧代码：圆形 + 高光 */ }
  
  flyTo(targetX, targetY, duration, ease = 'Cubic.easeOut', onComplete = null) {
    return this.scene.tweens.add({
      targets: this.sprite,
      x: targetX,
      y: targetY,
      duration,
      ease,
      onComplete
    });
  }
  
  setPositionDirect(x, y) {
    // Conveyor 的 update 循环每帧用这个，不要用 tween
    this.sprite.x = x;
    this.sprite.y = y;
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

## 6. Conveyor 类（核心循环驱动）

`src/entities/Conveyor.js`：

```javascript
import { CONFIG } from '../config/constants.js';
import { ConveyorTrack } from '../systems/ConveyorTrack.js';

export class Conveyor {
  constructor(scene, speed = CONFIG.CONVEYOR.DEFAULT_SPEED) {
    this.scene = scene;
    this.track = new ConveyorTrack();
    this.speed = speed;          // 单位：t per second
    this.marbles = [];           // 在传送带上的弹珠数组（无序）
    this.isPaused = false;       // 重力翻转期间会暂停
    this.outputPorts = [];       // 由 GameScene 注册
    
    this._renderTrack();
  }
  
  _renderTrack() {
    // 用 Graphics 画两条直线 + 两个半圆（带宽 = 弹珠直径 + 8）
    // 颜色：深灰背景 + 浅灰内衬纹理
    // 这是装饰，不参与逻辑
    const g = this.scene.add.graphics();
    g.lineStyle(36, 0x2a2a3e, 1);
    
    const trk = this.track;
    g.beginPath();
    g.moveTo(trk.leftX, trk.topY);
    g.lineTo(trk.rightX, trk.topY);
    g.arc(trk.rightX, trk.cy, trk.r, -Math.PI / 2, Math.PI / 2);
    g.lineTo(trk.leftX, trk.bottomY);
    g.arc(trk.leftX, trk.cy, trk.r, Math.PI / 2, -Math.PI / 2);
    g.strokePath();
    g.closePath();
    
    // 内衬高亮
    const inner = this.scene.add.graphics();
    inner.lineStyle(2, 0x4a4a5e, 0.5);
    // 同样路径...（略，参考上面）
  }
  
  registerOutputPort(port) {
    this.outputPorts.push(port);
  }
  
  /**
   * 弹珠从 funnel 抵达传送带入口时调用
   * 同步检查容量，溢出立即触发 Game Over
   */
  acceptMarble(marble) {
    if (this.marbles.length >= CONFIG.CONVEYOR.TOTAL_CAPACITY) {
      this._handleOverflow(marble);
      return false;
    }
    
    marble.state = 'on-conveyor';
    marble.t = this.track.entryT;
    this.marbles.push(marble);
    
    // 立即放到入口位置
    const pos = this.track.positionAt(marble.t);
    marble.setPositionDirect(pos.x, pos.y);
    
    return true;
  }
  
  _handleOverflow(marble) {
    marble.state = 'overflow-exit';
    
    // 视觉：在 funnel 出口处震动 + 飞出屏幕
    this.scene.tweens.add({
      targets: marble.sprite,
      x: marble.sprite.x + Phaser.Math.Between(-8, 8),
      duration: 60,
      repeat: 4,
      yoyo: true,
      onComplete: () => {
        this.scene.tweens.add({
          targets: marble.sprite,
          y: marble.sprite.y - 200,
          alpha: 0,
          duration: 400,
          onComplete: () => marble.destroy()
        });
      }
    });
    
    // 触发 Game Over（一次性）
    if (!this._overflowFired) {
      this._overflowFired = true;
      this.scene.events.emit('conveyor-overflow');
    }
  }
  
  /**
   * 每帧调用：推进所有弹珠的 t，并检测是否触发输出口
   */
  update(dt) {
    if (this.isPaused) return;
    
    const dts = dt / 1000;  // dt 是毫秒，转秒
    const advance = this.speed * dts;
    
    // 用 slice() 复制数组遍历，避免遍历中修改原数组
    for (const marble of this.marbles.slice()) {
      if (marble.state !== 'on-conveyor') continue;
      
      marble.t = (marble.t + advance) % 1;
      const pos = this.track.positionAt(marble.t);
      marble.setPositionDirect(pos.x, pos.y);
      
      // 检测每个输出口
      for (const port of this.outputPorts) {
        const dist = this._tDistance(marble.t, port.t);
        if (dist < CONFIG.OUTPUT_PORTS.DETECT_EPSILON) {
          // 询问该 port 的 BoxColumn 是否接受这个弹珠
          if (port.boxColumn.canAcceptColor(marble.color)) {
            this._dropMarble(marble, port);
            break;
          }
        }
      }
    }
  }
  
  /**
   * 计算两个 t 值的循环距离（取最短弧）
   */
  _tDistance(a, b) {
    const d = Math.abs(a - b);
    return Math.min(d, 1 - d);
  }
  
  /**
   * 把弹珠从传送带送到指定 OutputPort 的箱子里
   */
  _dropMarble(marble, port) {
    // 同步：从传送带数组移除
    const idx = this.marbles.indexOf(marble);
    if (idx !== -1) this.marbles.splice(idx, 1);
    
    marble.state = 'dropping-to-box';
    
    // 异步：飞向箱子
    const target = port.boxColumn.reserveSlotForColor(marble.color);
    if (!target) {
      // 防御性：理论上 canAcceptColor 已经过了不会进这里
      console.warn('Marble dropped but no slot available, discarding');
      marble.destroy();
      return;
    }
    
    marble.flyTo(
      target.x, target.y,
      CONFIG.MARBLE_PORT_DROP_DURATION,
      'Quad.easeIn',
      () => {
        port.boxColumn.fillVisualSlot(marble);
        marble.destroy();
      }
    );
  }
  
  /**
   * 磁铁吸附：把指定颜色的所有弹珠强制送到对应箱子
   */
  magnetize(color) {
    const matched = this.marbles.filter(
      m => m.color === color && m.state === 'on-conveyor'
    );
    
    matched.forEach((marble, i) => {
      const port = this.outputPorts.find(
        p => p.boxColumn.canAcceptColor(color)
      );
      
      // 同步移除
      const idx = this.marbles.indexOf(marble);
      if (idx !== -1) this.marbles.splice(idx, 1);
      
      this.scene.time.delayedCall(i * 80, () => {
        if (port) {
          marble.state = 'flying-to-magnet-target';
          const target = port.boxColumn.reserveSlotForColor(color);
          if (target) {
            marble.flyTo(target.x, target.y, 400, 'Cubic.easeOut', () => {
              port.boxColumn.fillVisualSlot(marble);
              marble.destroy();
            });
            return;
          }
        }
        // 没箱子接 → 飞出屏幕
        marble.state = 'overflow-exit';
        marble.flyTo(360, -100, 400, 'Cubic.easeOut', () => {
          marble.destroy();
        });
      });
    });
    
    return matched.length;
  }
  
  setPaused(paused) {
    this.isPaused = paused;
    // 视觉提示：暂停时传送带轨迹微微变暗
  }
  
  count() {
    return this.marbles.length;
  }
}
```

---

## 7. OutputPort 类

`src/entities/OutputPort.js`——传送带和 BoxColumn 的连接点。

```javascript
import { CONFIG } from '../config/constants.js';

export class OutputPort {
  constructor(scene, conveyorTrack, columnIndex, boxColumn) {
    this.scene = scene;
    this.columnIndex = columnIndex;  // 0..3
    this.boxColumn = boxColumn;
    
    // 计算这个 port 在传送带下层的 X 坐标
    const port = CONFIG.OUTPUT_PORTS;
    const totalSpan = (4 - 1) * port.GAP_BETWEEN;
    const conveyor = CONFIG.CONVEYOR;
    const startX = conveyor.AREA.x + (conveyor.AREA.width - totalSpan) / 2;
    this.x = startX + columnIndex * port.GAP_BETWEEN;
    
    // 反推 t 值
    this.t = conveyorTrack.tForLowerLayerX(this.x);
    
    this._render();
  }
  
  _render() {
    // 视觉：传送带下层底面有个开口（Graphics 画一个梯形小漏斗）
    // 颜色：根据 boxColumn 顶层箱颜色染色（动态更新）
    const port = CONFIG.OUTPUT_PORTS;
    const y = this.scene.conveyor.track.bottomY + 20;
    
    this.gateGraphics = this.scene.add.graphics();
    this._refreshGateColor();
  }
  
  _refreshGateColor() {
    this.gateGraphics.clear();
    const topColor = this.boxColumn.getTopBoxColor();
    if (!topColor) {
      // 整列已清空
      this.gateGraphics.fillStyle(0x2a2a3e, 0.5);
    } else {
      this.gateGraphics.fillStyle(topColor.hex, 1);
    }
    
    const port = CONFIG.OUTPUT_PORTS;
    const y = this.scene.conveyor.track.bottomY + 20;
    // 画一个朝下的梯形漏斗
    this.gateGraphics.fillTriangle(
      this.x - port.PORT_WIDTH / 2, y,
      this.x + port.PORT_WIDTH / 2, y,
      this.x, y + 30
    );
  }
  
  /**
   * BoxColumn 顶层变化时调用，刷新视觉
   */
  notifyColumnChanged() {
    this._refreshGateColor();
  }
}
```

---

## 8. Box 和 BoxColumn 类

### 8.1 Box（src/entities/Box.js）

```javascript
import { CONFIG } from '../config/constants.js';
import { COLORS } from '../config/colors.js';

export class Box {
  constructor(scene, color, capacity = 3) {
    this.scene = scene;
    this.color = color;
    this.capacity = capacity;
    this.current_count = 0;       // 数据真相（含飞行中）
    this.visual_filled = 0;       // 视觉真相
    this.reserved = 0;             // 已 reserve 但还没视觉填入
    this.container = scene.add.container(0, 0);
    this._render();
  }
  
  _render() {
    const w = CONFIG.BOX_COLUMNS.BOX_WIDTH;
    const h = CONFIG.BOX_COLUMNS.BOX_HEIGHT;
    const col = COLORS[this.color];
    
    // 底色
    const bg = this.scene.add.graphics();
    bg.fillStyle(col.hex, 0.85);
    bg.fillRoundedRect(-w/2, -h/2, w, h, 8);
    bg.lineStyle(2, 0x000000, 0.3);
    bg.strokeRoundedRect(-w/2, -h/2, w, h, 8);
    this.container.add(bg);
    this.bgGraphics = bg;
    
    // 3 个槽位标记
    this.slotMarkers = [];
    for (let i = 0; i < this.capacity; i++) {
      const sx = -w/2 + (i + 1) * (w / (this.capacity + 1));
      const slot = this.scene.add.graphics();
      slot.lineStyle(2, 0xffffff, 0.4);
      slot.strokeCircle(sx, 0, CONFIG.BOX_COLUMNS.SLOT_RADIUS);
      this.container.add(slot);
      this.slotMarkers.push({ x: sx, y: 0, graphics: slot });
    }
  }
  
  /**
   * 同步：reserve 一个槽位，返回世界坐标
   */
  reserveSlot() {
    if (this.current_count >= this.capacity) return null;
    const slotIdx = this.current_count;  // current_count 包含 reserved
    const local = this.slotMarkers[slotIdx];
    this.current_count += 1;
    this.reserved += 1;
    return {
      x: this.container.x + local.x,
      y: this.container.y + local.y
    };
  }
  
  /**
   * 异步动画完成时调用：视觉填入
   */
  fillVisualSlot(marble) {
    const slotIdx = this.visual_filled;
    const local = this.slotMarkers[slotIdx];
    
    // 在槽位画一个该色实心圆
    const filled = this.scene.add.graphics();
    filled.fillStyle(COLORS[this.color].hex, 1);
    filled.fillCircle(local.x, local.y, CONFIG.BOX_COLUMNS.SLOT_RADIUS);
    this.container.add(filled);
    
    this.visual_filled += 1;
    this.reserved -= 1;
    
    // 反馈
    this.scene.tweens.add({
      targets: this.container,
      scale: { from: 1.1, to: 1 },
      duration: 150
    });
    
    if (this.visual_filled >= this.capacity) {
      this._onFull();
    }
  }
  
  _onFull() {
    // 通知 BoxColumn 我满了
    this.scene.events.emit('box-full', this);
  }
  
  /**
   * 满了之后被 BoxColumn 调用：播消失动画并销毁
   */
  destroyWithAnimation(onComplete) {
    // 粒子爆发（07 完善）
    this.scene.tweens.add({
      targets: this.container,
      scale: 1.4,
      alpha: 0,
      duration: 250,
      ease: 'Back.easeIn',
      onComplete: () => {
        this.container.destroy();
        if (onComplete) onComplete();
      }
    });
  }
  
  /**
   * 是否可以接收某颜色（数据层判断）
   */
  canAccept(color) {
    return this.color === color && this.current_count < this.capacity;
  }
  
  setPosition(x, y) {
    // 用于上移动画
    this.container.x = x;
    this.container.y = y;
  }
  
  tweenPosition(x, y, duration = 300) {
    this.scene.tweens.add({
      targets: this.container,
      x, y,
      duration,
      ease: 'Cubic.easeOut'
    });
  }
}
```

### 8.2 BoxColumn（src/entities/BoxColumn.js）

```javascript
import { CONFIG } from '../config/constants.js';
import { Box } from './Box.js';
import { COLORS } from '../config/colors.js';

export class BoxColumn {
  constructor(scene, columnIndex, colorSequence, x) {
    this.scene = scene;
    this.columnIndex = columnIndex;
    this.x = x;                              // 列中心 X 坐标
    this.boxes = [];                         // 当前活跃的 Box 数组，索引 0 是顶层
    this.outputPort = null;                  // 由 GameScene 在 OutputPort 创建后注入
    
    this._buildBoxes(colorSequence);
  }
  
  _buildBoxes(colorSequence) {
    const area = CONFIG.BOX_COLUMNS.AREA;
    const h = CONFIG.BOX_COLUMNS.BOX_HEIGHT;
    const gap = CONFIG.BOX_COLUMNS.BOX_GAP;
    
    // 顶层箱子的 Y 坐标（最靠近传送带）
    const topY = area.y + h / 2;
    
    colorSequence.forEach((color, i) => {
      const box = new Box(this.scene, color, 3);
      const y = topY + i * (h + gap);
      box.setPosition(this.x, y);
      this.boxes.push(box);
    });
  }
  
  /**
   * 数据层：能否接受这个颜色（看顶层箱）
   */
  canAcceptColor(color) {
    if (this.boxes.length === 0) return false;
    return this.boxes[0].canAccept(color);
  }
  
  /**
   * 数据层：reserve 顶层箱的下一个槽位，返回坐标
   */
  reserveSlotForColor(color) {
    if (!this.canAcceptColor(color)) return null;
    return this.boxes[0].reserveSlot();
  }
  
  /**
   * 异步动画完成时：视觉填入顶层箱
   */
  fillVisualSlot(marble) {
    if (this.boxes.length === 0) return;
    this.boxes[0].fillVisualSlot(marble);
    // 满了的 box 会触发 'box-full' 事件，由 _onBoxFull 处理
  }
  
  /**
   * 由 GameScene 转发的 'box-full' 事件
   */
  onBoxFull(box) {
    if (this.boxes[0] !== box) {
      console.warn('Non-top box reported full?');
      return;
    }
    
    // 弹出顶层
    const removed = this.boxes.shift();
    
    removed.destroyWithAnimation(() => {
      // 通知 OutputPort 颜色变了
      if (this.outputPort) this.outputPort.notifyColumnChanged();
      
      // 检查整列是否清空
      if (this.boxes.length === 0) {
        this.scene.events.emit('column-cleared', this);
      }
    });
    
    // 下方所有箱子上移一格
    const h = CONFIG.BOX_COLUMNS.BOX_HEIGHT;
    const gap = CONFIG.BOX_COLUMNS.BOX_GAP;
    const area = CONFIG.BOX_COLUMNS.AREA;
    const topY = area.y + h / 2;
    
    this.boxes.forEach((b, i) => {
      b.tweenPosition(this.x, topY + i * (h + gap), 350);
    });
  }
  
  getTopBoxColor() {
    if (this.boxes.length === 0) return null;
    return COLORS[this.boxes[0].color];
  }
  
  isEmpty() {
    return this.boxes.length === 0;
  }
}
```

---

## 9. GameScene 改造

`src/scenes/GameScene.js`——保留所有 Scene 导航和 HUD，**只改"创建棋盘后"到"胜负检测"这一段**。

```javascript
import { Conveyor } from '../entities/Conveyor.js';
import { OutputPort } from '../entities/OutputPort.js';
import { BoxColumn } from '../entities/BoxColumn.js';
import { CONFIG } from '../config/constants.js';

export class GameScene extends Phaser.Scene {
  // ... init / preload 不变
  
  create() {
    const levelData = this.fromEditor 
      ? window._customLevelData 
      : this.cache.json.get('level');
    
    // 1. 校验关卡（防御性）
    try {
      this._validateLevelData(levelData);
    } catch (err) {
      this._showFatalError(err.message);
      return;
    }
    
    // 2. 棋盘 + Funnel（保留旧逻辑）
    this._drawAreas();
    this.funnel = new Funnel(this);
    this.boardSize = levelData.board_size;
    this.boardContainer = this.add.container(/* 同旧 */);
    
    // 3. 新增：传送带
    this.conveyor = new Conveyor(this, levelData.conveyor_speed || CONFIG.CONVEYOR.DEFAULT_SPEED);
    
    // 4. 新增：4 列 BoxColumn
    this.boxColumns = levelData.box_columns
      .sort((a, b) => a.col - b.col)
      .map(cfg => {
        const x = this._getColumnX(cfg.col);
        return new BoxColumn(this, cfg.col, cfg.boxes, x);
      });
    
    // 5. 新增：4 个 OutputPort，注入到 Conveyor 和 BoxColumn
    this.outputPorts = this.boxColumns.map((bc, i) => {
      const port = new OutputPort(this, this.conveyor.track, i, bc);
      this.conveyor.registerOutputPort(port);
      bc.outputPort = port;
      return port;
    });
    
    // 6. 创建方块（保留旧逻辑）
    this.blocks = levelData.blocks.map(d => new Block(this, d));
    this.boardManager = new BoardManager(this.blocks);
    
    // 7. 事件监听
    this.events.on('block-tapped', this._onBlockTapped, this);
    this.events.on('conveyor-overflow', this._onGameOver, this);
    this.events.on('box-full', (box) => {
      // 找到这个 box 所属的 column 并通知它
      for (const bc of this.boxColumns) {
        if (bc.boxes.includes(box)) {
          bc.onBoxFull(box);
          break;
        }
      }
    });
    this.events.on('column-cleared', () => this._checkVictory());
    
    // 8. HUD（保留旧逻辑：返回按钮、关卡号等）
    this._drawHUD();
    
    // 9. 调试 overlay（按 D 键）
    this.input.keyboard.on('keydown-D', () => this._toggleDebugOverlay());
  }
  
  update(time, delta) {
    if (this.conveyor) this.conveyor.update(delta);
  }
  
  _onBlockTapped(block) {
    if (this._inputLocked) return;
    if (block.isCovered || block.isCleared) return;
    
    block.shatter();
    this.boardManager.onBlockCleared(block);
    
    // ⚠ 9 颗弹珠（不是 6）
    for (let i = 0; i < CONFIG.MARBLES_PER_BLOCK; i++) {
      this.time.delayedCall(i * 70, () => {
        const marble = new Marble(
          this,
          block.container.x + Phaser.Math.Between(-30, 30),
          block.container.y,
          block.data.color
        );
        marble.state = 'falling-to-funnel';
        
        // 第一段：方块 → funnel
        const funnelX = CONFIG.FUNNEL_AREA.x + CONFIG.FUNNEL_AREA.width / 2;
        const funnelY = CONFIG.FUNNEL_AREA.y + CONFIG.FUNNEL_AREA.height;
        
        marble.flyTo(funnelX, funnelY, CONFIG.MARBLE_FALL_DURATION, 'Cubic.easeIn', () => {
          // 第二段：funnel → 传送带入口
          const entryPos = this.conveyor.track.positionAt(this.conveyor.track.entryT);
          marble.flyTo(entryPos.x, entryPos.y, CONFIG.MARBLE_TO_PORT_DURATION, 'Cubic.easeOut', () => {
            this.conveyor.acceptMarble(marble);
          });
        });
      });
    }
  }
  
  _onGameOver() {
    this._inputLocked = true;
    this.blocks.forEach(b => b.refreshInteractivity?.());
    this.time.delayedCall(800, () => {
      this.scene.start('GameOverScene', { 
        result: 'lose', 
        levelId: this.levelId,
        fromEditor: this.fromEditor
      });
    });
  }
  
  _checkVictory() {
    const allCleared = this.boxColumns.every(bc => bc.isEmpty());
    if (allCleared) {
      this.time.delayedCall(600, () => {
        this.scene.start('GameOverScene', { 
          result: 'win', 
          levelId: this.levelId,
          fromEditor: this.fromEditor
        });
      });
    }
  }
  
  _getColumnX(col) {
    const port = CONFIG.OUTPUT_PORTS;
    const totalSpan = (4 - 1) * port.GAP_BETWEEN;
    const conveyor = CONFIG.CONVEYOR;
    const startX = conveyor.AREA.x + (conveyor.AREA.width - totalSpan) / 2;
    return startX + col * port.GAP_BETWEEN;
  }
  
  _validateLevelData(data) {
    // 见 第 2.3 节的 validateLevel 实现
  }
  
  _toggleDebugOverlay() {
    // 显示：conveyor.count() / 24, 每个 column 剩余箱子数, _inputLocked
  }
}
```

---

## 10. 边界测试矩阵

实现完成后必须跑过这些场景：

| # | 场景 | 期望 |
|---|---|---|
| 1 | 关卡：1 个粉方块 + col0 顶层 1 个粉箱 | 点方块 → 9 颗粉弹珠流到 col0 → 装满 3 个 → 箱消失 → 该列空 → Victory |
| 2 | 关卡：所有 4 列各 1 个不同色箱（粉/蓝/绿/黄）+ 4 方块对应色 | 4 个方块依次点击，4 列依次清空 → Victory |
| 3 | 关卡：col0 顶箱粉，2nd 蓝。先点蓝方块（9 颗蓝） | 9 颗蓝在传送带循环，col0 顶箱粉拒收，需要先清完 col0 的粉才能进 |
| 4 | 关卡：方块数 × 9 < 总箱容（关卡设计错误） | 加载时报错，不进游戏 |
| 5 | 故意快速点击多个方块，超过 24 容量 | 超出的弹珠在 funnel 出口震动 + 飞出，触发 Game Over，**只触发一次** |
| 6 | 上层弹珠还在转的时候点新方块 | 新弹珠正常进入入口（如果 24 没满） |
| 7 | 磁铁吸取传送带上某色 | 该色弹珠平滑飞向对应列顶箱（如果有匹配箱），无匹配箱时飞出屏幕 |
| 8 | 重力翻转期间 | 传送带 isPaused = true，弹珠停在原 t；翻转完成后继续转 |
| 9 | 同时多颗同色弹珠靠近同一输出口 | 按 t 顺序逐个 reserve 槽位，不会两颗都试图占同一槽 |
| 10 | 一个箱子刚装满消失的瞬间，另一颗弹珠也到了输出口 | 老顶箱已 destroy，新顶箱（颜色可能不同）的 canAcceptColor 决定是否接 |

---

## 11. 调试 overlay（按 D 键 toggle）

```
┌─────────────────────────────────┐
│ Conveyor: 8 / 24                │
│ Speed: 0.06 (1 lap = 16.7s)     │
│ Paused: false                   │
│ ─────────────────────────────── │
│ Col0: [P, B, Y, Y]  top=P       │
│ Col1: [B, P]        top=B       │
│ Col2: [G, U, G]     top=G       │
│ Col3: []            CLEARED     │
│ ─────────────────────────────── │
│ Input locked: false             │
│ Marbles in flight: 3            │
└─────────────────────────────────┘
```

---

## 12. 给 Codex 的执行 Prompt

把这段直接复制：

```
你已经完成了 00-04 + Pointer Hit Zone bugfix。游戏方向有重大调整：从 "静态队列+静态托盘" 改为 "循环传送带+列式收集箱"。本次任务执行 02c_CONVEYOR_BOX.md。

执行前请按顺序读：
1. specs/00_MASTER_SPEC.md（共享上下文）
2. specs/02_CORE_GAMEPLAY.md（旧版核心循环，部分概念仍然有效，但 Queue/Tray 整体废弃）
3. specs/02b_QUEUE_TRAY_LOGIC.md（已 DEPRECATED，仅看顶部"同步数据/异步视觉解耦"原则，其他全部失效）
4. specs/02c_CONVEYOR_BOX.md（本次主任务）
5. 你之前写的 Pointer Hit Zone Bugfix Record（hitZone 系统必须保留）

== 核心架构原则（继承自 02b，违反则任务失败）==
当一颗弹珠匹配到 Box 时：
- 同步阶段：立即 splice conveyor.marbles、立即调用 box.reserveSlot()、立即 +1 box.current_count
- 异步阶段：才启动飞行 Tween 到 reserveSlot 返回的坐标
绝对不能在 Tween 的 onComplete 里才做 reserveSlot 或数据更新。

== 必须保留不动的代码 ==
- Block.js（包括 hitZone、refreshInteractivity）
- BoardManager.js
- Funnel.js（视觉漏斗）
- 所有 Scene：MenuScene / LevelSelectScene / EditorScene / GameOverScene 的导航部分
- /src/ui/hitZones.js
- /src/levels/*.json 文件位置（schema 字段会变，但加载机制保留）
- 03、04 任务里跟"传送带/箱子"无关的代码（编辑器框架、关卡卡片、HUD 等）

== 必须删除的代码 ==
- /src/entities/Queue.js（整个文件）
- /src/entities/Tray.js（整个文件）
- GameScene.js 里所有 Queue/Tray 实例化和事件监听代码（不是 GameScene 整个删，是删中间那段）
- /src/levels/*.json 里的 trays 和 queue_capacity 字段
- 编辑器（EditorScene.js + EditorState.js）里 trays 和 queue_capacity 相关 UI 和数据（这部分由 03、04 的更新任务接手，本任务先删）

== 新建的代码 ==
- /src/systems/ConveyorTrack.js（参数化轨迹数学，纯逻辑）
- /src/entities/Conveyor.js（传送带主类，update 循环驱动弹珠 t 推进）
- /src/entities/OutputPort.js（4 个固定输出口）
- /src/entities/Box.js（单个箱子，3 容量）
- /src/entities/BoxColumn.js（一列箱子，从顶到底）

== 关键数字（不要改）==
- 方块产生 9 颗弹珠（不是 6）→ CONFIG.MARBLES_PER_BLOCK = 9
- 传送带容量 24（上下层各 12）→ CONFIG.CONVEYOR.TOTAL_CAPACITY = 24
- Box 容量 3
- 列数固定 4
- Game Over 阈值固定 24（所有关卡同样）

== 关卡 JSON 字段变更 ==
- 删除：trays, queue_capacity
- 新增：box_columns（4 列，每列 boxes 数组从顶到底）
- 新增（可选）：conveyor_speed（默认 0.06）
- 保留：blocks, board_size, gravity_flip_enabled, magnet_count, level_id, name, difficulty
- 新关卡数据由 03 的更新任务负责重新生成；本任务只需生成一个 level_test.json 用于自验

== 执行步骤 ==
1. 更新 src/config/constants.js：加 MARBLES_PER_BLOCK=9 和 CONVEYOR / OUTPUT_PORTS / BOX_COLUMNS 配置
2. 删除 Queue.js, Tray.js
3. 实现 ConveyorTrack.js 并写一个 console 单元测试验证 5 个 t 值的坐标
4. 实现 Marble.js 的状态机更新（state 枚举改为新 7 个状态）
5. 实现 Conveyor.js（含 update 循环、acceptMarble、_dropMarble、magnetize、setPaused）
6. 实现 Box.js（含 reserveSlot/fillVisualSlot 双计数、destroyWithAnimation）
7. 实现 BoxColumn.js（含 canAcceptColor/reserveSlotForColor、onBoxFull 触发上移）
8. 实现 OutputPort.js（位置反推 t，notifyColumnChanged 染色）
9. 改造 GameScene.js：删除旧 Queue/Tray 部分，加新传送带/箱子部分，新增 update() 调用 conveyor.update(dt)
10. 更新所有现有 *.json 关卡为新 schema，但因为是 03 的事，本任务只生成 level_test.json
11. 运行边界测试矩阵 1-10 全部 10 个场景，提交测试报告
12. 更新 hitZone 用法：因为 Box 不需要点击响应（暂不支持），不要给 Box 加 hitZone

== 保留 hitZone bugfix 兼容性 ==
- Block 仍用 hitZone + refreshInteractivity 三守卫（!isCovered && !isCleared && !scene._inputLocked && !scene.gravityFlip?.isFlipping）
- GameOver 时 this.blocks.forEach(b => b.setInputEnabled(false))（公开 API 已存在）
- Conveyor / OutputPort / Box / BoxColumn 不接受点击，**不需要 hitZone**
- 磁铁按钮（05 任务，未做）保留 hitZone 模式

== 调试 overlay ==
按 D 键 toggle 一个文本 overlay，显示：
- conveyor.count() / 24
- conveyor.speed
- conveyor.isPaused
- 每列：[box颜色序列] top=X 或 CLEARED
- _inputLocked 状态
- 飞行中弹珠数量（state in ['falling-to-funnel', 'dropping-to-box', 'flying-to-magnet-target']）

== 硬约束 ==
- 不要引入 Matter.js 或任何物理引擎
- 不要改 level JSON 文件的存放位置
- 不要破坏 Pointer Hit Zone 系统
- 不要把 Conveyor 或 Box 的视觉做成 Container.setInteractive（虽然它们不需要点击，写错的人很多）
- 不要让 update() 在 isPaused 时仍然推进 t
- 不要在 Tween onComplete 里做 reserveSlot（破坏 sync/async 解耦原则）

== 交付 ==
1. 修改后的 constants.js / Marble.js / GameScene.js
2. 删除 Queue.js, Tray.js（git rm）
3. 新建 ConveyorTrack.js / Conveyor.js / OutputPort.js / Box.js / BoxColumn.js
4. ConveyorTrack 单元测试输出（console.log 5 个关键点的坐标）
5. 一个 level_test.json（最简：1 方块 + 1 单色单箱列，用于第一个 smoke test）
6. 边界测试矩阵 1-10 的实际测试结果（贴 console 输出）
7. 用 D 键 overlay 截图（或文本 dump）证明数据状态正确

完成后停下，不要继续做 03、04、05、06、07 的更新（这些后续任务等我 review 通过 02c 后再发）。
```

---

## 13. 后续任务的关联影响

完成 02c 后必须做的后续任务（这次先不做）：

- **03_LEVELS_v2**：3 关 JSON 全部用新 schema 重写
- **04_EDITOR_v2**：编辑器加 box_columns 编辑（每列拖拽颜色 + 增删箱子）+ 实时校验"方块×9 = 箱容×3"
- **05_MAGNET_v2**：磁铁逻辑改为调用 `conveyor.magnetize(color)`
- **06_GRAVITY_FLIP**：加上"翻转期间 conveyor.setPaused(true)"
- **07_POLISH_DEPLOY**：加箱子消失粒子、整列上移弹簧曲线、传送带容量警戒丝带

每个后续任务我会单独写一份 spec。
