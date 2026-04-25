# Task 06_v2 — 重力翻转关卡机制（传送带版）

> **优先级**：P1（创新分）
> **预计工时**：3-4 小时（基本沿用旧 06，加传送带暂停）
> **依赖**：02c, 03_v2, 05_v2 已完成
> **执行前必读**：`00_MASTER_SPEC.md`, `02c_CONVEYOR_BOX.md`, `06_GRAVITY_FLIP.md`（旧版）
>
> **本任务对原 06_GRAVITY_FLIP.md 的改动很小**：只增加"翻转期间传送带暂停"和"翻转期间禁用 hitZone"两条。其余规格全部沿用旧版。

## 改动点摘要

旧版 06 已经有的内容（**全部保留**）：
- GravityFlip 类的核心机制
- 90° 顺时针旋转的坐标变换数学
- 视觉旋转动画 + 震动 + 闪光
- boardContainer 整体旋转再瞬移方块的设计
- isFlipping flag 锁输入
- 翻转后弹珠晃动反馈

**新增的 4 条**：

### 改动 1：翻转期间暂停传送带

`GravityFlip.trigger()` 开头加：

```javascript
trigger() {
  if (this.flipCount <= 0 || this.isFlipping) return;
  this.isFlipping = true;
  this.flipCount--;
  
  // ⚠ 新增：暂停传送带
  this.scene.conveyor?.setPaused(true);
  
  // ... 原有的旋转动画
}
```

旋转动画的 `onComplete` 末尾加：

```javascript
onComplete: () => {
  // ... 原有的瞬移方块 + recomputeCoverage
  
  this.isFlipping = false;
  this._refresh();
  
  // ⚠ 新增：恢复传送带
  this.scene.conveyor?.setPaused(false);
}
```

### 改动 2：翻转期间 Block 不响应点击

旧版 06 已经在 Block.setupInteraction 里加了：

```javascript
this.container.on('pointerdown', () => {
  if (this.scene.gravityFlip?.isFlipping) return;
  // ...
});
```

但因为 Pointer Hit Zone bugfix 改了 hitZone 模式，**这条逻辑应该已经被并入 Block.refreshInteractivity()** 的三守卫之一：

```javascript
refreshInteractivity() {
  const enabled = !this.isCovered 
                && !this.isCleared 
                && !this.scene._inputLocked
                && !this.scene.gravityFlip?.isFlipping;  // ← 这条已存在
  this.setInputEnabled(enabled);
  return enabled;
}
```

**本次任务确认**：这条三守卫之一在 02b → 02c → bugfix → 后续任务的迭代中没被丢掉。

### 改动 3：FLIP 按钮位置调整

旧版 06 把 FLIP 按钮放在屏幕中间偏上（漏斗上方）。新版传送带占据了屏幕中下大块空间，FLIP 按钮位置需要重新选：

**新位置**：放在棋盘区右下角，X=620 Y=680（接近 Funnel 的右上方）。这样不挡传送带，也不挡棋盘。

或者：放在顶部 HUD 的右侧（与 magnet 按钮对称的位置）。

**建议第二方案**——磁铁在左、FLIP 在右，对称且明显。

更新 GravityFlip.render()：

```javascript
render() {
  const x = 640;       // 顶部 HUD 右侧
  const y = 40;
  
  this.button = this.scene.add.container(x, y);
  
  const bg = this.scene.add.graphics();
  bg.fillStyle(0x4ec5f1, 1);
  bg.fillRoundedRect(-60, -28, 120, 56, 28);
  this.button.add(bg);
  
  this.label = this.scene.add.text(0, 0, `🔄 ×${this.flipCount}`, {
    fontSize: 22, color: '#fff', fontStyle: 'bold'
  }).setOrigin(0.5);
  this.button.add(this.label);
  
  // ⚠ 用 hitZone 模式（与 bugfix 一致）
  const hitZone = attachHitZone(this.scene, this.button, 120, 56, {
    onPointerUp: () => this.trigger()
  });
  
  this._refresh();
}
```

### 改动 4：翻转时是否应该清空传送带？

**不应该**。翻转是改变板子布局，不影响传送带上已经在转的弹珠。所以：
- 弹珠 t 值保持不变
- 传送带暂停（不推进 t）
- 翻转完成后传送带继续从原 t 推进

这个行为已在 改动 1 中实现。

## 关于 boardContainer 的协调

旧版 06 强调把所有方块放进 `boardContainer` 以便整体旋转。这个设计在新核心循环下**仍然有效**——因为传送带、箱子都不在 boardContainer 里，翻转时它们不受影响。

确认一下 GameScene.create() 顺序：

```javascript
create() {
  // 1. boardContainer（用于翻转）
  this.boardContainer = this.add.container(...);
  
  // 2. blocks 都 add 到 boardContainer
  this.blocks.forEach(b => this.boardContainer.add(b.container));
  
  // 3. conveyor / boxColumns / outputPorts 都直接 add 到 scene（不进 boardContainer）
  this.conveyor = new Conveyor(this);
  this.boxColumns = ...;
  
  // 4. GravityFlip 实例化（如果启用）
  if (levelData.gravity_flip_enabled) {
    this.gravityFlip = new GravityFlip(this, this.blocks, this.boardManager);
  }
}
```

## 验收标准

- [ ] Level 3 加载时，顶部 HUD 右侧出现 FLIP 按钮，显示 ×2
- [ ] Level 1 / Level 2 没有 FLIP 按钮
- [ ] 点 FLIP：板子顺时针 90° 旋转，伴震动 + 闪光
- [ ] 翻转期间传送带停止滚动，弹珠定格在原位
- [ ] 翻转完成后传送带继续滚动，弹珠从原 t 继续推进
- [ ] 翻转期间 Block 无法点击
- [ ] 翻转期间 Magnet 按钮无法点击（防御性，避免视觉混乱）
- [ ] 翻转 4 次后板子回到原状（坐标 identity 测试）
- [ ] FLIP 按钮按一次数量 -1，归 0 时变灰
- [ ] Level 3 用磁铁 + 翻转 + 8 次方块点击能通关

## Agent Prompt（直接复制给 Codex）

```
你已经完成了 02c + 03_v2 + 04_v2 + 05_v2。现在执行 06_v2_GRAVITY_FLIP.md。

执行前请按顺序读：
1. specs/00_MASTER_SPEC.md
2. specs/02c_CONVEYOR_BOX.md（核心）
3. specs/06_GRAVITY_FLIP.md（旧版，绝大部分内容仍有效）
4. specs/06_v2_GRAVITY_FLIP.md（本任务）

== 任务 ==
1. 创建 src/systems/GravityFlip.js，按旧版 06_GRAVITY_FLIP.md 的描述实现核心机制（坐标变换、旋转动画、isFlipping flag）
2. trigger() 开头调用 this.scene.conveyor?.setPaused(true)
3. trigger() 旋转动画 onComplete 末尾调用 this.scene.conveyor?.setPaused(false)
4. FLIP 按钮位置改到顶部 HUD 右侧 (x=640, y=40)，对称于左侧的 magnet 按钮
5. 按钮的点击响应用 attachHitZone（不要 container.setInteractive）
6. 确认 Block.refreshInteractivity() 包含 !this.scene.gravityFlip?.isFlipping 守卫
7. GameScene.create() 中：if (levelData.gravity_flip_enabled) this.gravityFlip = new GravityFlip(...)
8. GameScene.create() 中：boardContainer 仅装 blocks，不装 conveyor / boxColumns / outputPorts

== 硬约束 ==
- 翻转动画期间不能让 boardContainer 永久旋转：动画走完后立刻 angle=0 + 瞬移方块到新格子
- Block.data.col / data.row 必须实际更新，否则下次翻转基于旧数据
- 用顺时针 90°：new_col = (ROWS-1) - old_row, new_row = old_col
- 5×5 板子（cols == rows），不要交换 board_size
- 翻转期间 conveyor.isPaused = true，update() 内部已经会跳过推进 t（02c 已实现）

== 自验 ==
1. Level 3 加载，FLIP 按钮可见且数量 ×2
2. 点击 FLIP：所有方块顺时针转 90°，传送带上弹珠定格，震动 + 闪光
3. 翻转 4 次后用调试 overlay 确认 conveyor.isPaused 状态正常切换 true/false 4 次
4. 翻转 4 次后板子回到原状（找一个特定 id 的方块，看它的 col/row 是否回到原值）
5. 翻转期间快速点击方块，应无响应

== 交付 ==
1. src/systems/GravityFlip.js
2. 更新后的 GameScene.js（仅 GravityFlip 实例化和 boardContainer 部分）
3. 自验报告 + 4 次翻转的坐标验证结果
```
