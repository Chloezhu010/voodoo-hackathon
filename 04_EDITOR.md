# Task 04 — 关卡编辑器

> **优先级**：P0（gate，Track Minimum Requirement）
> **预计工时**：4-5 小时
> **依赖**：Task 02（共用 Block 渲染、JSON schema）
> **执行前必读**：`00_MASTER_SPEC.md`

## 任务目标

实现 EditorScene，让用户能在浏览器内**可视化创建/修改**关卡，导出 JSON 字符串，导入 JSON 字符串还原场景。这是 Track 1 的硬性要求之一。

## 设计原则

- 不需要做得花哨，**功能完整**优于美观
- 复用 Task 02 的 Block 渲染逻辑
- 数据格式必须与 `00_MASTER_SPEC.md` 第 7 节的 Level JSON 严格一致
- 编辑器导出的 JSON 必须能直接被 GameScene 加载并通关

## 编辑器布局

```
┌────────────────────────────────────────────┐
│ [← Menu]   LEVEL EDITOR     [Play Test]    │  顶部 HUD
├────────────────────────────────────────────┤
│                                            │
│        ┌─────────────────────┐             │
│        │                     │             │
│        │    5×5 Grid Canvas  │             │  主编辑区
│        │   (with placed      │             │
│        │    blocks)          │             │
│        │                     │             │
│        └─────────────────────┘             │
│                                            │
├────────────────────────────────────────────┤
│ Color Palette: [P][B][G][Y][U][O] [?][🗑]   │  调色板
├────────────────────────────────────────────┤
│ Z-Layer: [▼ z=0 ▲]  Trays: [+P][+B]...     │  层级 + Tray
├────────────────────────────────────────────┤
│ Queue: [10][12][14][16]  GravFlip: [☐]     │  关卡参数
├────────────────────────────────────────────┤
│ [Export JSON] [Import JSON] [Clear All]    │  IO
└────────────────────────────────────────────┘
```

## 详细规格

### 1. 文件清单

```
src/scenes/EditorScene.js           # 主场景
src/systems/EditorState.js          # 编辑器状态管理
```

### 2. EditorState 数据结构

```javascript
class EditorState {
  constructor() {
    this.gridCols = 5;
    this.gridRows = 5;
    this.blocks = [];           // { id, col, row, z, color, is_hidden }
    this.trays = [];            // { color, capacity: 6 }
    this.queueCapacity = 12;
    this.gravityFlipEnabled = false;
    this.magnetCount = 0;
    
    // 编辑器自身状态
    this.activeColor = 'pink';
    this.activeZ = 0;
    this.activeIsHidden = false;
    this.eraseMode = false;
  }
  
  placeBlock(col, row) {
    if (this.eraseMode) return this.removeBlock(col, row);
    
    // 同 (col, row, z) 已有方块 → 覆盖颜色
    const existing = this.blocks.find(b => 
      b.col === col && b.row === row && b.z === this.activeZ
    );
    
    if (existing) {
      existing.color = this.activeColor;
      existing.is_hidden = this.activeIsHidden;
    } else {
      this.blocks.push({
        id: `b${Date.now()}_${Math.floor(Math.random()*1000)}`,
        col, row, z: this.activeZ,
        color: this.activeColor,
        is_hidden: this.activeIsHidden
      });
    }
  }
  
  removeBlock(col, row) {
    // 删除指定位置的最高层方块（z 最大的）
    const stack = this.blocks
      .filter(b => b.col === col && b.row === row)
      .sort((a, b) => b.z - a.z);
    if (stack.length === 0) return;
    const top = stack[0];
    this.blocks = this.blocks.filter(b => b.id !== top.id);
  }
  
  toggleTray(color) {
    const idx = this.trays.findIndex(t => t.color === color);
    if (idx >= 0) {
      this.trays.splice(idx, 1);
    } else {
      this.trays.push({ color, capacity: 6 });
    }
  }
  
  exportJSON() {
    return JSON.stringify({
      level_id: 99,
      name: 'Custom Level',
      difficulty: 0,
      board_size: { cols: this.gridCols, rows: this.gridRows },
      blocks: this.blocks,
      trays: this.trays,
      queue_capacity: this.queueCapacity,
      gravity_flip_enabled: this.gravityFlipEnabled,
      magnet_count: this.magnetCount
    }, null, 2);
  }
  
  importJSON(jsonStr) {
    const data = JSON.parse(jsonStr);
    this.blocks = data.blocks || [];
    this.trays = data.trays || [];
    this.queueCapacity = data.queue_capacity || 12;
    this.gravityFlipEnabled = data.gravity_flip_enabled || false;
    this.magnetCount = data.magnet_count || 0;
    if (data.board_size) {
      this.gridCols = data.board_size.cols;
      this.gridRows = data.board_size.rows;
    }
  }
  
  clear() {
    this.blocks = [];
    this.trays = [];
  }
}
```

### 3. EditorScene 视觉与交互

#### 3.1 Grid Canvas（主编辑区）

- 在中央绘制 5×5 网格，每格 96×96 像素
- 网格线浅灰色 `#3a3a55`
- 点击格子：根据当前 `eraseMode` 放置或擦除方块
- **同位置 Z 层显示**：如果某格有多个 z 层，z 最大的画在最上面，下层用半透明小角标显示
  - 比如格子右下角画一个数字 "+1" 表示该格还有 z=0 的方块被遮挡
- 鼠标 hover 网格 → 显示半透明 ghost 预览当前选中颜色的方块

#### 3.2 调色板（顶部第 3 行）

7 个按钮，水平排列：
- 6 个颜色按钮（pink/blue/green/yellow/purple/orange），点击切换 `activeColor`，当前选中的高亮（描边）
- 1 个 `?` 按钮，点击切换 `activeIsHidden`（toggle）
- 1 个垃圾桶按钮，点击切换 `eraseMode`，激活时整个调色板变红边框
- 选中状态用 4px 白色描边表示

按钮规格：64×64，间距 8px，圆角 12

#### 3.3 Z 层级控制

- 显示当前 `activeZ` 数值
- 上下箭头按钮调整（范围 0-2，三层够用）
- 提示文字："Higher z = on top"

#### 3.4 Tray 选择器

6 个圆形小按钮，每个对应一个颜色。点击切换该色 Tray 是否启用。
- 启用：实心填充该色
- 未启用：空心 + 灰色描边
- 点击触发 `editorState.toggleTray(color)`

#### 3.5 关卡参数

- Queue Capacity：4 个数字按钮 [10][12][14][16][20]，点击设置
- Gravity Flip：复选框，点击切换 `gravityFlipEnabled`
- Magnet Count：数字 stepper [-][0/1/2/3][+]

#### 3.6 IO 按钮区（底部）

- **Export JSON**：弹出一个简单的覆盖层（modal），里面是只读 textarea 显示 `editorState.exportJSON()` 的结果，附带 "Copy to Clipboard" 按钮
- **Import JSON**：弹出 modal，可编辑 textarea，"Load" 按钮调用 `editorState.importJSON()`，失败显示错误
- **Clear All**：确认对话框 → `editorState.clear()`
- **Play Test**（顶部）：把当前编辑器状态保存到 `window._customLevelData`，跳到 GameScene 并通过 init 参数传入；GameScene 检测到 `levelId === 99` 时从 `window._customLevelData` 读关卡

### 4. Modal 实现（简版）

不要用 HTML overlay，用 Phaser 的 Container + Rectangle 做：

```javascript
showExportModal() {
  const modal = this.add.container(360, 640);
  
  // 背景蒙版
  const bg = this.add.rectangle(0, 0, 720, 1280, 0x000000, 0.7);
  modal.add(bg);
  
  // 面板
  const panel = this.add.rectangle(0, 0, 600, 800, 0x2d2d44);
  panel.setStrokeStyle(2, 0xffffff);
  modal.add(panel);
  
  // 标题
  modal.add(this.add.text(0, -350, 'Exported JSON', { 
    fontSize: 32, color: '#fff', fontStyle: 'bold' 
  }).setOrigin(0.5));
  
  // 文本内容（用 DOM Text Element 或 Phaser Text 多行）
  const json = this.editorState.exportJSON();
  const txt = this.add.text(-280, -300, json, { 
    fontSize: 16, color: '#a0ffa0', wordWrap: { width: 560 } 
  });
  modal.add(txt);
  
  // Copy 按钮
  const copyBtn = this._makeButton(0, 320, 'COPY');
  copyBtn.on('pointerdown', () => {
    navigator.clipboard.writeText(json);
    // 显示 toast
  });
  modal.add(copyBtn);
  
  // Close 按钮
  const closeBtn = this._makeButton(0, 380, 'CLOSE');
  closeBtn.on('pointerdown', () => modal.destroy());
  modal.add(closeBtn);
}
```

### 5. Play Test 流程

```javascript
// 在 EditorScene 顶部
playTest() {
  if (this.editorState.blocks.length === 0) {
    this.showToast('Place at least one block!');
    return;
  }
  if (this.editorState.trays.length === 0) {
    this.showToast('Add at least one tray!');
    return;
  }
  
  // 校验：所有 block 颜色都得有对应 tray，否则提示
  const blockColors = new Set(this.editorState.blocks.map(b => b.color));
  const trayColors = new Set(this.editorState.trays.map(t => t.color));
  for (const c of blockColors) {
    if (!trayColors.has(c)) {
      this.showToast(`Color ${c} has no tray!`);
      return;
    }
  }
  
  window._customLevelData = JSON.parse(this.editorState.exportJSON());
  this.scene.start('GameScene', { levelId: 99, fromEditor: true });
}
```

`GameScene.init()` 改造：
```javascript
init(data) {
  this.levelId = data.levelId || 0;
  this.fromEditor = data.fromEditor || false;
}

preload() {
  if (!this.fromEditor) {
    this.load.json('level', `src/levels/level_${pad(this.levelId, 2)}.json`);
  }
}

create() {
  const levelData = this.fromEditor 
    ? window._customLevelData 
    : this.cache.json.get('level');
  // ... 其余不变
}
```

GameOverScene 也要处理：从编辑器测试的关卡，按钮变成 "BACK TO EDITOR" 而不是 "RETRY"。

### 6. MenuScene 接入

把之前 "Coming Soon" 的 LEVEL EDITOR 按钮接通：
```javascript
editorBtn.on('pointerdown', () => this.scene.start('EditorScene'));
```

## 验收标准

- [ ] 主菜单点 LEVEL EDITOR 进入编辑器
- [ ] 编辑器加载时网格为空，调色板默认选中 pink，z=0
- [ ] 点击网格放置粉色方块，再次点击同位置覆盖
- [ ] 切到 erase 模式，点击方块删除
- [ ] 切到 z=1，在已有方块上叠加新方块，看到右下角 "+1" 标识
- [ ] 切换 `?` 按钮，放置的方块视觉上变成灰色问号
- [ ] 添加几个 Tray，状态正确
- [ ] 点击 Export，看到合法 JSON，能复制到剪贴板
- [ ] 复制的 JSON 粘贴到 Import 还能完美还原场景
- [ ] 创建一个简单关卡（4 个 pink + 1 个 pink tray）→ 点 Play Test → 进入 GameScene 能正常通关
- [ ] GameScene 通关/失败后能 BACK TO EDITOR 回到刚才编辑的状态（state 应保留）

## Agent Prompt（直接复制给 Codex）

```
You are implementing the level editor for "Marble Sort!" per 04_EDITOR.md.

Read 00_MASTER_SPEC.md, 02_CORE_GAMEPLAY.md first. Core gameplay is done. The Block rendering and Level JSON schema are already established — you must reuse them, not redefine.

This is a P0 gate task per Voodoo Track 1 requirements.

Strict rules:
- The exported JSON schema must EXACTLY match what GameScene expects (00_MASTER_SPEC section 7)
- A level created in the editor and Play-Tested must reach the WIN state if designed correctly
- Use Phaser-only modals (Container + Rectangle), no HTML overlay
- Reuse the Block rendering function from Task 02 — extract it to a shared util if needed

Tasks in order:
1. Create EditorState.js with the data model
2. Create EditorScene.js with grid canvas + palette + Z stepper + tray toggles + parameter controls + IO buttons
3. Implement Export modal (read-only textarea + clipboard copy)
4. Implement Import modal (editable textarea + load + validation)
5. Implement Play Test flow (stash state to window._customLevelData, route to GameScene with levelId=99)
6. Update GameScene.init() and preload() to handle fromEditor=true case
7. Wire MenuScene's LEVEL EDITOR button
8. Update GameOverScene to show "BACK TO EDITOR" instead of "RETRY" when fromEditor=true

Deliver:
1. EditorState.js, EditorScene.js
2. Updated GameScene.js, GameOverScene.js, MenuScene.js
3. Manual test report against the acceptance checklist
4. A sample exported JSON proving round-trip works
```
