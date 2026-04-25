# Task 04_v2 — 关卡编辑器（box_columns 编辑版）

> **优先级**：P0（gate）
> **预计工时**：2-3 小时
> **依赖**：02c, 03_v2 已完成
> **执行前必读**：`00_MASTER_SPEC.md`, `02c_CONVEYOR_BOX.md`
>
> **本任务是对原 04_EDITOR.md 的增量更新**。原编辑器框架（grid canvas、调色板、Z 层级、IO 按钮、Play Test）保留，只替换 trays 编辑部分为 box_columns 编辑。

## 改动范围

**保留不动**：
- Grid canvas + 方块放置
- 颜色调色板
- Z 层级 stepper
- `?` 隐藏方块切换
- erase 模式
- Export/Import JSON modal
- Play Test 流程
- Clear All
- Magnet count stepper
- Gravity Flip 复选框
- 顶部 HUD（返回、PLAY TEST 按钮）

**删除**：
- Tray 选择器（6 个圆形小按钮的那一行）
- Queue Capacity 数字按钮
- EditorState 中的 `trays`、`queueCapacity` 字段

**新增**：
- Box Columns 编辑面板（替代原 Tray 选择器位置，但需要更大空间）
- 实时校验状态显示（"方块数×9 = 36 / 箱容×3 = 36 ✓" 或 红色 ✗）
- Conveyor Speed 滑块

## 详细规格

### 1. EditorState 数据结构变更

`src/systems/EditorState.js`：

```javascript
export class EditorState {
  constructor() {
    this.gridCols = 5;
    this.gridRows = 5;
    this.blocks = [];
    
    // ⚠ 新字段
    this.boxColumns = [
      { col: 0, boxes: [] },
      { col: 1, boxes: [] },
      { col: 2, boxes: [] },
      { col: 3, boxes: [] }
    ];
    this.conveyorSpeed = 0.06;
    
    this.gravityFlipEnabled = false;
    this.magnetCount = 0;
    
    this.activeColor = 'pink';
    this.activeZ = 0;
    this.activeIsHidden = false;
    this.eraseMode = false;
    
    // ⚠ 新字段：当前正在编辑的列（点击列编辑面板时切换）
    this.activeColumn = 0;  // 0..3
  }
  
  // ===== Block 相关方法保留不变 =====
  placeBlock(col, row) { /* 同旧 */ }
  removeBlock(col, row) { /* 同旧 */ }
  
  // ===== Tray 相关方法删除 =====
  // toggleTray(color) → 删除
  
  // ===== 新增 BoxColumn 方法 =====
  addBoxToColumn(colIdx, color) {
    // 把一个 box 添加到指定列的"底部"（数组末尾，因为索引 0 是顶层）
    const column = this.boxColumns[colIdx];
    column.boxes.push(color);
  }
  
  removeBoxFromColumn(colIdx, boxIdx) {
    const column = this.boxColumns[colIdx];
    column.boxes.splice(boxIdx, 1);
  }
  
  setBoxColor(colIdx, boxIdx, color) {
    const column = this.boxColumns[colIdx];
    if (boxIdx >= 0 && boxIdx < column.boxes.length) {
      column.boxes[boxIdx] = color;
    }
  }
  
  clearColumn(colIdx) {
    this.boxColumns[colIdx].boxes = [];
  }
  
  // ===== 校验方法（实时显示用）=====
  getValidationStatus() {
    const totalMarbles = this.blocks.length * 9;
    const totalBoxCapacity = this.boxColumns.reduce(
      (s, c) => s + c.boxes.length, 0
    ) * 3;
    
    const blockColors = {};
    this.blocks.forEach(b => {
      blockColors[b.color] = (blockColors[b.color] || 0) + 1;
    });
    
    const boxColors = {};
    this.boxColumns.forEach(c => {
      c.boxes.forEach(color => {
        boxColors[color] = (boxColors[color] || 0) + 1;
      });
    });
    
    const colorMismatch = [];
    const allColors = new Set([
      ...Object.keys(blockColors),
      ...Object.keys(boxColors)
    ]);
    for (const color of allColors) {
      const m = (blockColors[color] || 0) * 9;
      const b = (boxColors[color] || 0) * 3;
      if (m !== b) {
        colorMismatch.push({ color, marbles: m, slots: b });
      }
    }
    
    return {
      totalMarbles,
      totalBoxCapacity,
      totalsMatch: totalMarbles === totalBoxCapacity,
      colorMismatch,
      isValid: totalMarbles === totalBoxCapacity 
               && colorMismatch.length === 0
               && this.blocks.length > 0
    };
  }
  
  // ===== Export/Import 更新 =====
  exportJSON() {
    return JSON.stringify({
      level_id: 99,
      name: 'Custom Level',
      difficulty: 0,
      board_size: { cols: this.gridCols, rows: this.gridRows },
      blocks: this.blocks,
      box_columns: this.boxColumns,
      conveyor_speed: this.conveyorSpeed,
      gravity_flip_enabled: this.gravityFlipEnabled,
      magnet_count: this.magnetCount
    }, null, 2);
  }
  
  importJSON(jsonStr) {
    const data = JSON.parse(jsonStr);
    this.blocks = data.blocks || [];
    this.boxColumns = data.box_columns || [
      { col: 0, boxes: [] }, { col: 1, boxes: [] },
      { col: 2, boxes: [] }, { col: 3, boxes: [] }
    ];
    this.conveyorSpeed = data.conveyor_speed || 0.06;
    this.gravityFlipEnabled = data.gravity_flip_enabled || false;
    this.magnetCount = data.magnet_count || 0;
    if (data.board_size) {
      this.gridCols = data.board_size.cols;
      this.gridRows = data.board_size.rows;
    }
  }
  
  clear() {
    this.blocks = [];
    this.boxColumns = [
      { col: 0, boxes: [] }, { col: 1, boxes: [] },
      { col: 2, boxes: [] }, { col: 3, boxes: [] }
    ];
  }
}
```

### 2. Box Columns 编辑面板视觉

替换原 Tray 选择器的位置（屏幕中下部）。新面板布局：

```
┌─────────────────────────────────────────────────┐
│ BOX COLUMNS                  [✓ 36/36 valid]    │
│                                                 │
│  Col0      Col1      Col2      Col3             │
│  ┌────┐   ┌────┐   ┌────┐   ┌────┐             │
│  │ ●P │   │ ●Y │   │ ●G │   │ ●P │ ← 顶层      │
│  ├────┤   ├────┤   ├────┤   ├────┤             │
│  │ ●B │   │ ●Y │   │ ●Y │   │ ●Y │             │
│  ├────┤   ├────┤   ├────┤   ├────┤             │
│  │ ●P │   │ +  │   │ ●B │   │ ●G │             │
│  ├────┤   └────┘   ├────┤   ├────┤             │
│  │ +  │            │ +  │   │ +  │ ← 加号      │
│  └────┘            └────┘   └────┘             │
└─────────────────────────────────────────────────┘
```

**交互**：

- 每个箱子是个矩形，宽 70 高 30，带颜色 + 字母标签
- 点击箱子：用当前调色板的 `activeColor` 替换该箱颜色
- 长按箱子（500ms）：删除该箱
- 每列底部有一个 `+` 按钮，点击：添加一个当前 `activeColor` 颜色的箱子到该列底部
- 列上限：每列最多 6 个箱子（视觉空间限制）

**校验状态指示器**（右上角）：
- 绿色 `✓ 36/36 valid` ：通过
- 红色 `✗ 36/30 mismatch` ：总数不对
- 红色 `✗ pink: 18M vs 9S` ：某色不守恒（鼠标 hover 显示详细）

### 3. EditorScene 改动

```javascript
// EditorScene.js create()

create() {
  // 1. 顶部 HUD（保留）
  this._drawHUD();
  
  // 2. Grid canvas（保留）
  this._drawGrid();
  this._drawPlacedBlocks();
  
  // 3. 调色板（保留）
  this._drawColorPalette();
  
  // 4. Z stepper（保留）
  this._drawZStepper();
  
  // 5. ⚠ 旧 Tray 选择器删除，替换为 Box Columns 面板
  this._drawBoxColumnsPanel();
  
  // 6. 关卡参数（部分保留 + 新增）
  // - 删除：Queue Capacity 数字按钮
  // - 保留：Gravity Flip 复选框
  // - 保留：Magnet Count stepper
  // - 新增：Conveyor Speed 滑块
  this._drawParameters();
  
  // 7. IO 按钮（保留）
  this._drawIOButtons();
  
  // 8. ⚠ 新增：实时校验状态条
  this._drawValidationStatus();
}

_drawBoxColumnsPanel() {
  // 4 列横向排列
  // 每列从顶到底渲染 boxes 数组
  // 每个 box 用 hitZone（保留 bugfix 模式）响应点击/长按
  // 列底部 `+` 按钮也用 hitZone
}

_drawValidationStatus() {
  // 右上角，每次 state 变化时刷新
  this.validationText = this.add.text(...);
  this._refreshValidationStatus();
}

_refreshValidationStatus() {
  const status = this.editorState.getValidationStatus();
  if (status.isValid) {
    this.validationText.setText(`✓ ${status.totalMarbles}/${status.totalBoxCapacity} valid`);
    this.validationText.setColor('#7ed957');
  } else if (!status.totalsMatch) {
    this.validationText.setText(`✗ ${status.totalMarbles}/${status.totalBoxCapacity} mismatch`);
    this.validationText.setColor('#ff3355');
  } else if (status.colorMismatch.length > 0) {
    const c = status.colorMismatch[0];
    this.validationText.setText(`✗ ${c.color}: ${c.marbles}M vs ${c.slots}S`);
    this.validationText.setColor('#ff9a3c');
  }
}

// 任何 EditorState 变更后都要调用 _refreshValidationStatus()
// 推荐做法：把 placeBlock / addBoxToColumn 等都封装成 EditorScene 的方法，
// 调用 EditorState 后立刻刷新
```

### 4. Conveyor Speed 滑块

简单实现：3 个按钮 [Slow 0.04][Normal 0.06][Fast 0.08]，点击设置 `editorState.conveyorSpeed`。

视觉位置：放在 Magnet Count 旁边。

### 5. Play Test 校验

`playTest()` 改造（在原基础上加预检查）：

```javascript
playTest() {
  // 旧的方块/列空检查保留
  if (this.editorState.blocks.length === 0) {
    this.showToast('Place at least one block!');
    return;
  }
  
  const totalBoxes = this.editorState.boxColumns.reduce(
    (s, c) => s + c.boxes.length, 0
  );
  if (totalBoxes === 0) {
    this.showToast('Add at least one box!');
    return;
  }
  
  // ⚠ 新校验
  const status = this.editorState.getValidationStatus();
  if (!status.totalsMatch) {
    this.showToast(`Marble count must equal box capacity (${status.totalMarbles} vs ${status.totalBoxCapacity})`);
    return;
  }
  if (status.colorMismatch.length > 0) {
    const c = status.colorMismatch[0];
    this.showToast(`Color ${c.color} not balanced: ${c.marbles} marbles vs ${c.slots} slots`);
    return;
  }
  
  window._customLevelData = JSON.parse(this.editorState.exportJSON());
  this.scene.start('GameScene', { levelId: 99, fromEditor: true });
}
```

### 6. Box Columns Panel 的 hitZone 实现

复用 04 已经做完的 `attachHitZone` 工具：

```javascript
_drawBox(colIdx, boxIdx, color, x, y) {
  const w = 70, h = 30;
  
  const container = this.add.container(x, y);
  
  // 视觉
  const bg = this.add.graphics();
  bg.fillStyle(COLORS[color].hex, 1);
  bg.fillRoundedRect(-w/2, -h/2, w, h, 4);
  bg.lineStyle(2, 0xffffff, 0.4);
  bg.strokeRoundedRect(-w/2, -h/2, w, h, 4);
  container.add(bg);
  
  const label = this.add.text(0, 0, color[0].toUpperCase(), {
    fontSize: 16, color: '#fff', fontStyle: 'bold'
  }).setOrigin(0.5);
  container.add(label);
  
  // hitZone（保留 bugfix 模式）
  const hitZone = attachHitZone(this, container, w, h, {
    onPointerUp: () => {
      // 点击：用 activeColor 替换
      this.editorState.setBoxColor(colIdx, boxIdx, this.editorState.activeColor);
      this._redrawBoxColumnsPanel();
      this._refreshValidationStatus();
    },
    onLongPress: () => {
      // 长按 500ms：删除
      this.editorState.removeBoxFromColumn(colIdx, boxIdx);
      this._redrawBoxColumnsPanel();
      this._refreshValidationStatus();
    }
  });
}
```

> 如果 hitZones.js 还没有 onLongPress 支持，简化为：右键删除（pointerdown event.button === 2），手机端长按用 setTimeout 300ms 触发。但注意右键和移动端的兼容性，简单方案：**在每个 box 旁边加个小 X 按钮删除**，比长按更直观。

## 验收标准

- [ ] 编辑器加载时显示 4 个空列 + 实时校验状态条
- [ ] 放置 1 个 pink 方块 → 校验显示 `✗ 9/0 mismatch`
- [ ] 在 col0 添加 3 个 pink 箱 → 校验显示 `✓ 9/9 valid`
- [ ] 创建合法关卡 → Play Test 进入 GameScene 能正常通关
- [ ] 创建不合法关卡 → Play Test 弹 toast 阻止
- [ ] Export JSON 包含 box_columns / conveyor_speed 字段，无 trays / queue_capacity
- [ ] Import 03 任务的 level_01.json 能完美还原
- [ ] Conveyor Speed 三个档位切换有效
- [ ] 已有的方块编辑、Z 层级、erase、`?` 切换、Clear All 全部仍工作

## Agent Prompt（直接复制给 Codex）

```
你已经完成了 02c + 03_v2。现在执行 04_v2_EDITOR.md，更新关卡编辑器以支持 box_columns 编辑。

执行前请按顺序读：
1. specs/00_MASTER_SPEC.md
2. specs/02c_CONVEYOR_BOX.md（关卡 schema 来源）
3. specs/03_v2_LEVELS.md（新关卡格式参考）
4. specs/04_EDITOR.md（旧编辑器规格，多数仍有效）
5. specs/04_v2_EDITOR.md（本任务）
6. 你之前写的 Pointer Hit Zone Bugfix Record（hitZone 模式必须保留）

== 任务 ==
1. 更新 EditorState.js：删除 trays / queueCapacity 字段和方法；新增 boxColumns / conveyorSpeed / activeColumn 字段；新增 addBoxToColumn / removeBoxFromColumn / setBoxColor / clearColumn / getValidationStatus 方法
2. 更新 EditorScene.js：
   - 删除 Tray 选择器渲染代码
   - 删除 Queue Capacity 按钮渲染代码
   - 新增 _drawBoxColumnsPanel 渲染 4 列箱子（每列从顶到底，每箱用 hitZone）
   - 新增 _drawValidationStatus 显示实时校验状态
   - 新增 Conveyor Speed 三档按钮
   - 改写 playTest() 加 totals 和颜色守恒预检查
3. Box 点击交互：左键替换为 activeColor，右键或小 X 按钮删除（不强求长按手势）
4. 任何修改 EditorState 的操作之后必须调用 _refreshValidationStatus() 刷新状态条

== 硬约束 ==
- 保留 hitZone 模式（attachHitZone）用于所有可点击元素
- 保留 04 已有的 Export/Import modal、Play Test 流程、Clear All
- 不能再支持 trays / queue_capacity 字段（即使旧 JSON Import 进来也要忽略这两个字段）
- 列数固定 4，编辑器不允许增减列
- 每列 box 数上限 6（视觉空间）
- 不要破坏 03_v2 的 level_01/02/03.json，它们必须能被这个编辑器 Import

== 自验 ==
1. 创建 1 个 pink 方块 + col0 加 3 个 pink 箱 → 校验显示 ✓ 9/9
2. Play Test 进入 GameScene 能通关
3. Import level_02.json，所有 4 方块和 12 箱正确显示
4. Export 后的 JSON 与 Import 来源完全一致（除 level_id 重置为 99）

== 交付 ==
1. 修改后的 EditorState.js / EditorScene.js
2. 自验视频或截图描述（描述文字版即可）
3. 一个手动创建的合法 sample 关卡的 export JSON 贴出来证明 round-trip 正确
```
