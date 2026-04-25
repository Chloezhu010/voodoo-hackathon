# Task 06 — 重力翻转关卡机制（创新点 2）

> **优先级**：P1（创新分）
> **预计工时**：3-4 小时
> **依赖**：Task 02, 03, 05
> **执行前必读**：`00_MASTER_SPEC.md`

## 任务目标

为启用 `gravity_flip_enabled: true` 的关卡（目前是 Level 3）添加 **重力翻转** 机制：玩家可以按一个按钮，让整个棋盘旋转 90°，方块根据新重力方向重新排列。这是 reference 游戏完全没有的机制，是 Creativity 维度的第二个拉分点。

## 设计意图

- 为什么不旋转 180°？因为 180° 几乎等于"原状", 玩家直观感不强
- 90° 旋转后，原本被遮挡的方块可能被"翻"到顶上 → 新的解法路径
- 限制使用次数（每关 2 次），避免无脑解谜

## 详细规格

### 1. 文件清单

```
src/systems/GravityFlip.js          # 翻转系统
src/scenes/GameScene.js             # 集成翻转按钮
```

### 2. 核心机制：怎么"翻转"

**关键决策**：我们不真的旋转 Phaser 的 game object（那会引入坐标系混乱）。而是**重新计算 (col, row, z) 数据**，然后把所有方块**用 Tween 平滑动画到新位置**。

**翻转规则**（顺时针 90°）：

对一个 `cols × rows` 的棋盘，方块 `(col, row)` 翻转后变为 `(rows - 1 - row, col)`：

```
原板 (5x5):                  顺时针 90° 后:
  col→  0 1 2 3 4               col→  0 1 2 3 4
row=0 [A . . . B]            row=0 [C . . . A]
row=1 [. . . . .]            row=1 [. . . . .]
row=2 [. . X . .]            row=2 [. . X . .]
row=3 [. . . . .]            row=3 [. . . . .]
row=4 [C . . . D]            row=4 [D . . . B]
```

公式：`new_col = rows - 1 - old_row`, `new_row = old_col`

**Z 层级处理**：
- 翻转后，z 层级**保留不变**（方块本身的层级关系不因翻转改变）
- 但被遮挡关系会重新计算（因为某些方块可能落到了别的格子，遮挡关系变了）

**重要简化**：
- 我们的板子是 5×5 方形 → 旋转 90° 后仍然是 5×5，不需要交换 cols 和 rows
- 如果某天做矩形板子，需要交换 board_size

### 3. GravityFlip 类（src/systems/GravityFlip.js）

```javascript
export class GravityFlip {
  constructor(scene, blocks, boardManager) {
    this.scene = scene;
    this.blocks = blocks;
    this.boardManager = boardManager;
    this.flipCount = 2;  // 初始 2 次
    this.isFlipping = false;
    this.button = null;
    this.render();
  }
  
  render() {
    const x = 360;       // 居中
    const y = 740;       // 漏斗上方
    
    this.button = this.scene.add.container(x, y);
    
    // 按钮背景
    const bg = this.scene.add.graphics();
    bg.fillStyle(0x4ec5f1, 1);
    bg.fillRoundedRect(-80, -28, 160, 56, 28);
    this.button.add(bg);
    
    // 文字
    this.label = this.scene.add.text(0, 0, `🔄 FLIP ×${this.flipCount}`, {
      fontSize: 24, color: '#fff', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.button.add(this.label);
    
    // 交互
    bg.setInteractive(new Phaser.Geom.Rectangle(-80, -28, 160, 56), 
                      Phaser.Geom.Rectangle.Contains);
    bg.on('pointerdown', () => this.trigger());
    
    this._refresh();
  }
  
  _refresh() {
    if (this.flipCount <= 0) {
      this.button.setAlpha(0.4);
    } else {
      this.button.setAlpha(1);
    }
    this.label.setText(`🔄 FLIP ×${this.flipCount}`);
  }
  
  trigger() {
    if (this.flipCount <= 0 || this.isFlipping) return;
    this.isFlipping = true;
    this.flipCount--;
    
    // 1. 计算新坐标
    const ROWS = this.scene.boardSize.rows;
    
    const updates = this.blocks
      .filter(b => !b.isCleared)
      .map(b => {
        const newCol = ROWS - 1 - b.data.row;
        const newRow = b.data.col;
        return { block: b, newCol, newRow };
      });
    
    // 2. 屏幕震动 + 蓝色闪光提示
    this.scene.cameras.main.shake(200, 0.008);
    this.scene.cameras.main.flash(150, 100, 200, 255);
    
    // 3. 全局旋转动画（视觉上整个板子转一下，再回正）
    const boardContainer = this.scene.boardContainer;
    
    this.scene.tweens.add({
      targets: boardContainer,
      angle: 90,
      duration: 600,
      ease: 'Cubic.easeInOut',
      onComplete: () => {
        // 旋转动画结束后，重置角度并瞬间更新方块坐标
        boardContainer.angle = 0;
        
        updates.forEach(({ block, newCol, newRow }) => {
          block.data.col = newCol;
          block.data.row = newRow;
          // 重新计算屏幕坐标
          const newWorldPos = this._gridToWorld(newCol, newRow);
          block.container.x = newWorldPos.x;
          block.container.y = newWorldPos.y;
        });
        
        // 4. 重新计算遮挡
        this.boardManager.recomputeCoverage();
        
        this.isFlipping = false;
        this._refresh();
      }
    });
  }
  
  _gridToWorld(col, row) {
    // 复用 GameScene 的 grid → world 坐标函数
    return this.scene._gridToWorld(col, row);
  }
}
```

### 4. GameScene 集成

需要在 GameScene 里做几个改动：

#### 4.1 把方块放进一个容器（boardContainer）以便整体旋转

```javascript
// GameScene.create()
this.boardContainer = this.add.container(
  CONFIG.BOARD_AREA.x + CONFIG.BOARD_AREA.width / 2,
  CONFIG.BOARD_AREA.y + CONFIG.BOARD_AREA.height / 2
);

// 创建 Block 时把它的 container add 到 boardContainer
this.blocks.forEach(b => {
  this.boardContainer.add(b.container);
  // 注意：container 的 x/y 现在是相对于 boardContainer 中心的偏移
});
```

#### 4.2 grid → world 坐标函数

```javascript
_gridToWorld(col, row) {
  const cellSize = CONFIG.BLOCK_SIZE;
  const offsetX = (col - (this.boardSize.cols - 1) / 2) * cellSize;
  const offsetY = (row - (this.boardSize.rows - 1) / 2) * cellSize;
  return { x: offsetX, y: offsetY };  // 相对于 boardContainer 中心
}
```

#### 4.3 条件性创建 GravityFlip

```javascript
import { GravityFlip } from '../systems/GravityFlip.js';

// 在 create() 末尾
if (levelData.gravity_flip_enabled) {
  this.gravityFlip = new GravityFlip(this, this.blocks, this.boardManager);
}
```

### 5. 翻转期间的输入禁用

`isFlipping = true` 时，所有 Block 的点击事件应该被禁用。最简单的实现：

```javascript
// Block.setupInteraction
this.container.on('pointerdown', () => {
  if (this.scene.gravityFlip?.isFlipping) return;
  if (this.isCovered || this.isCleared) return;
  this.scene.events.emit('block-tapped', this);
});
```

### 6. UX 反馈

- 翻转前：按钮按下时缩放反馈（0.95）
- 翻转中：所有 Block 微微变暗 0.7 alpha（暗示"暂停"）
- 翻转后：所有 Block 弹回 1.0 alpha + 各自 100ms 间隔的依次"晃动"动画（增加爽快感）

```javascript
// 翻转结束的 onComplete 中：
this.blocks.filter(b => !b.isCleared).forEach((b, i) => {
  this.scene.tweens.add({
    targets: b.container,
    alpha: 1,
    scale: { from: 0.85, to: 1 },
    duration: 200,
    delay: i * 30,
    ease: 'Back.easeOut'
  });
});
```

### 7. 编辑器接入

EditorScene 已经有 `gravityFlipEnabled` 复选框。这里不需要改编辑器，自定义关卡也能用此机制。

## 验收标准

- [ ] Level 3 加载时，棋盘上方出现 "🔄 FLIP ×2" 按钮
- [ ] Level 1 / Level 2 没有此按钮
- [ ] 点击 FLIP：板子顺时针转 90°，伴有屏幕震动 + 蓝色闪光
- [ ] 翻转后方块到达正确的新位置（手动用调试输出对比 col/row 变化）
- [ ] 翻转后被遮挡关系重新计算（如原本被压在底下的方块，可能因为翻转后压它的方块跑到了别处而变得可点击）
- [ ] 翻转期间无法点击方块
- [ ] FLIP 按钮按一次数量 -1，到 0 时变灰
- [ ] 翻转后还能正常点击方块、生成弹珠、消除托盘（不破坏核心循环）
- [ ] Level 3 在使用了翻转 + 磁铁的情况下可通关

## 关键避坑

1. **不要把 boardContainer 永久旋转**。旋转 90° 后立刻 `angle = 0` 并瞬移方块到新格子，是为了避免后续坐标系混乱
2. **新坐标的世界位置要重算**，因为 boardContainer 没真的转
3. **方块的 `data.col` 和 `data.row` 必须实际更新**，否则下次翻转会基于旧数据计算错
4. **isFlipping flag 必须在 onComplete 末尾才 false**，别提前
5. **测试：连续翻 4 次应该回到原状**（4 × 90° = 360°）。这是单元测试级别的验证
6. **弹珠正在掉落或在队列里时翻转**：弹珠不在 boardContainer 里，不受影响。但需要测试这种状态没有奇怪的视觉问题

## Agent Prompt（直接复制给 Codex）

```
You are implementing the Gravity Flip mechanic for "Marble Sort!" per 06_GRAVITY_FLIP.md.

Read 00_MASTER_SPEC.md, 02_CORE_GAMEPLAY.md, 05_MAGNET.md first. Core + Magnet are done.

This is a Creativity feature unique to Level 3 (gravity_flip_enabled flag in level JSON).

Strict rules:
- Do NOT rotate Phaser objects permanently. The visual rotation is a transient animation; the actual position update is a teleport at the animation's end.
- Block.data.col and Block.data.row MUST be updated to the new values, otherwise subsequent flips will compound errors.
- For a 5x5 grid, clockwise 90° rotation: new_col = (ROWS-1) - old_row, new_row = old_col.
- isFlipping flag must block all block-tapped events during the animation.

Tasks in order:
1. Refactor GameScene to put all blocks into a `boardContainer` Container at the board's center
2. Add `_gridToWorld(col, row)` helper that returns position RELATIVE to boardContainer center
3. Update Block placement to use boardContainer-relative positions
4. Create src/systems/GravityFlip.js with the full class
5. Conditionally instantiate GravityFlip in GameScene.create() when level has gravity_flip_enabled
6. Update Block.setupInteraction to check `isFlipping`
7. Test: load Level 3, flip once, manually verify a known block moved correctly (e.g., block at col=0,row=0 should go to col=4,row=0)
8. Test: flip 4 times → board should be back to original positions
9. Test: flip while marbles are falling → marbles should not be affected (they're not in boardContainer)

Deliver:
1. GravityFlip.js
2. Updated GameScene.js, Block.js
3. Manual test log including the 4x flip identity test
```
