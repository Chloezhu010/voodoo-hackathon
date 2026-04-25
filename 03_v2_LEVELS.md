# Task 03_v2 — 3 个关卡设计（传送带 + 列式收集箱版）

> **优先级**：P0（gate）
> **预计工时**：1.5-2 小时
> **依赖**：02c 已完成
> **执行前必读**：`00_MASTER_SPEC.md`, `02c_CONVEYOR_BOX.md`
>
> **本任务替代原 03_LEVELS.md**。原文件作废，但保留作历史参考。

## 关卡设计哲学（新核心循环下）

新机制下的设计目标变了：

- **不再是"颜色总数 vs 队列容量"的张力**，而是 **"传送带空间 vs 顶层箱颜色匹配"** 的时空张力
- 玩家点击方块的节奏决定传送带占用率，**点错颜色 → 弹珠在传送带上空转一圈一圈**，磁铁是关键救场
- "方块数 × 9 == 总箱容 × 3" 的硬约束让每个关卡的弹珠流量是固定的，**没有"多余空间"**

设计原则：
1. **Level 1**：单色单列，教传送带循环 + 箱子消失逻辑
2. **Level 2**：多色 + 顶层颜色顺序错配，教"等下一圈"或"用磁铁"
3. **Level 3**：6 色 + 4 列复杂堆叠 + 重力翻转 + 隐藏方块，复合压力测试

## 关卡数据

### Level 1 — Tutorial（保底关）

`src/levels/level_01.json`：

```json
{
  "level_id": 1,
  "name": "Tutorial",
  "difficulty": 1,
  "board_size": { "cols": 5, "rows": 5 },
  "blocks": [
    { "id": "b1", "col": 1, "row": 1, "z": 0, "color": "pink",  "is_hidden": false },
    { "id": "b2", "col": 2, "row": 1, "z": 0, "color": "pink",  "is_hidden": false },
    { "id": "b3", "col": 3, "row": 1, "z": 0, "color": "blue",  "is_hidden": false },
    { "id": "b4", "col": 1, "row": 2, "z": 0, "color": "blue",  "is_hidden": false },
    { "id": "b5", "col": 2, "row": 2, "z": 0, "color": "green", "is_hidden": false },
    { "id": "b6", "col": 3, "row": 2, "z": 0, "color": "green", "is_hidden": false }
  ],
  "box_columns": [
    { "col": 0, "boxes": ["pink", "pink", "blue"] },
    { "col": 1, "boxes": ["blue", "green"] },
    { "col": 2, "boxes": ["green", "pink"] },
    { "col": 3, "boxes": ["pink", "blue", "green"] }
  ],
  "conveyor_speed": 0.05,
  "gravity_flip_enabled": false,
  "magnet_count": 0
}
```

**校验**：
- 方块数 6 × 9 = 54 颗弹珠
- 箱子总数 = 3 + 2 + 2 + 3 = 10 → 10 × 3 = 30 ❌

不对。让我重新设计——关卡设计的硬约束是数学题，必须严密。

```
方块数 × 9 == 总箱容 × 3
↔ 方块数 × 3 == 总箱数
↔ 总箱数 = 方块数 × 3

颜色守恒（每色独立）：
某色方块数 × 9 == 该色箱位数 × 3
↔ 某色箱数 = 某色方块数 × 3
```

**Level 1 重设计**（满足约束）：

```json
{
  "level_id": 1,
  "name": "Tutorial",
  "difficulty": 1,
  "board_size": { "cols": 5, "rows": 5 },
  "blocks": [
    { "id": "b1", "col": 1, "row": 1, "z": 0, "color": "pink",  "is_hidden": false },
    { "id": "b2", "col": 2, "row": 1, "z": 0, "color": "pink",  "is_hidden": false },
    { "id": "b3", "col": 3, "row": 1, "z": 0, "color": "blue",  "is_hidden": false },
    { "id": "b4", "col": 1, "row": 2, "z": 0, "color": "blue",  "is_hidden": false }
  ],
  "box_columns": [
    { "col": 0, "boxes": ["pink", "pink", "pink"] },
    { "col": 1, "boxes": ["blue", "blue", "blue"] },
    { "col": 2, "boxes": ["pink", "pink", "pink"] },
    { "col": 3, "boxes": ["blue", "blue", "blue"] }
  ],
  "conveyor_speed": 0.05,
  "gravity_flip_enabled": false,
  "magnet_count": 0
}
```

**校验**：
- 方块数 4 × 9 = 36 颗弹珠
- 箱子总数 4 × 3 = 12 → 12 × 3 = 36 ✅
- pink 方块 2 × 9 = 18 颗 → pink 箱 6 × 3 = 18 ✅
- blue 方块 2 × 9 = 18 颗 → blue 箱 6 × 3 = 18 ✅

**设计意图**：
- 只有 2 色，每个箱列内同色（顶到底都是同色），最简
- 4 个方块各 9 颗弹珠 = 36 颗在传送带上流转
- 传送带容量 24，所以中途至少要消化 12 颗才不溢出 → 自然教学"动作不能太快"
- 速度 0.05 = 一圈 20 秒，比较慢，留时间观察
- 无磁铁、无翻转、无遮挡、无隐藏 → 纯教学

**Tutorial 提示文字**（GameScene 针对 levelId=1 显示）：
- 进入关卡 toast：「Tap blocks to send marbles to the conveyor. Marbles drop into matching boxes below.」
- 5 秒后自动消失

### Level 2 — Color Logic（核心难度关）

```json
{
  "level_id": 2,
  "name": "Wrong Color, Right Time",
  "difficulty": 2,
  "board_size": { "cols": 5, "rows": 5 },
  "blocks": [
    { "id": "t1", "col": 1, "row": 1, "z": 1, "color": "pink",   "is_hidden": false },
    { "id": "t2", "col": 2, "row": 1, "z": 1, "color": "yellow", "is_hidden": false },
    { "id": "h1", "col": 1, "row": 1, "z": 0, "color": "blue",   "is_hidden": true },
    { "id": "h2", "col": 2, "row": 1, "z": 0, "color": "green",  "is_hidden": true },
    { "id": "m1", "col": 1, "row": 2, "z": 0, "color": "yellow", "is_hidden": false },
    { "id": "m2", "col": 2, "row": 2, "z": 0, "color": "blue",   "is_hidden": false },
    { "id": "m3", "col": 3, "row": 2, "z": 0, "color": "green",  "is_hidden": false },
    { "id": "b1", "col": 1, "row": 3, "z": 0, "color": "pink",   "is_hidden": false }
  ],
  "box_columns": [
    { "col": 0, "boxes": ["pink", "blue", "green"] },
    { "col": 1, "boxes": ["yellow", "yellow"] },
    { "col": 2, "boxes": ["blue", "pink", "green"] },
    { "col": 3, "boxes": ["pink", "yellow", "green"] }
  ],
  "conveyor_speed": 0.06,
  "gravity_flip_enabled": false,
  "magnet_count": 1
}
```

**校验**：
- 方块数 8 × 9 = 72 颗弹珠
- 箱子数 3 + 2 + 3 + 3 = 11 ❌ 11 × 3 = 33 ≠ 72

错了，我必须严密做数学。重新设计 Level 2：

```
方块数 = 8 → 总箱数必须 = 24
颜色统计：pink=2, yellow=2, blue=2, green=2
所以每色箱数 = 6（每色方块数 × 3）

总箱数 24 / 4 列 = 平均每列 6 箱 → 太多不放
8 个方块改 4 个会更精简
```

**Level 2 重设计**（4 方块 + 12 箱）：

```json
{
  "level_id": 2,
  "name": "Wrong Color, Right Time",
  "difficulty": 2,
  "board_size": { "cols": 5, "rows": 5 },
  "blocks": [
    { "id": "t1", "col": 1, "row": 1, "z": 1, "color": "pink",   "is_hidden": false },
    { "id": "t2", "col": 2, "row": 1, "z": 1, "color": "yellow", "is_hidden": false },
    { "id": "h1", "col": 1, "row": 1, "z": 0, "color": "blue",   "is_hidden": true },
    { "id": "h2", "col": 2, "row": 1, "z": 0, "color": "green",  "is_hidden": true }
  ],
  "box_columns": [
    { "col": 0, "boxes": ["yellow", "blue", "pink"] },
    { "col": 1, "boxes": ["pink", "green", "yellow"] },
    { "col": 2, "boxes": ["green", "yellow", "blue"] },
    { "col": 3, "boxes": ["blue", "pink", "green"] }
  ],
  "conveyor_speed": 0.06,
  "gravity_flip_enabled": false,
  "magnet_count": 1
}
```

**校验**：
- 方块数 4 × 9 = 36 颗
- 箱数 3 × 4 = 12 → 12 × 3 = 36 ✅
- pink 方块 1 × 9 = 9 → pink 箱 3 → 3 × 3 = 9 ✅
- yellow 方块 1 × 9 = 9 → yellow 箱 3 ✅
- blue 方块 1 × 9 = 9 → blue 箱 3 ✅
- green 方块 1 × 9 = 9 → green 箱 3 ✅

**设计意图**：
- 4 色，但**每列顶层颜色不同且顺序刻意错配**：col0 顶 yellow / col1 顶 pink / col2 顶 green / col3 顶 blue
- 每列里面的颜色顺序是混合的（如 col0 是 yellow→blue→pink），玩家清掉顶层后下一层颜色就变了
- 顶层 t1/t2 (pink/yellow) 遮挡底层 h1/h2 (blue/green)：必须先清顶层才知道底色
- 速度 0.06，比 Level 1 快 20%
- 1 个磁铁救急
- **关键张力**：玩家点 pink → 9 颗 pink 在传送带上，但 col0 顶层是 yellow / col1 顶层是 pink / col2 顶层是 green / col3 顶层是 blue → 只有 col1 接受 pink。9 颗 pink 必须等绕到 col1 上方才能掉进去（中间会被 col0/col2/col3 拒收）。这就是核心张力。

**通关思路**：
1. 先点 t1（pink）→ 9 颗 pink 流到传送带 → 等绕到 col1 → 全部被 col1 接收
2. 现在 col1 顶层变成 green，col0 顶层仍是 yellow
3. 再点 t2（yellow）→ 9 颗 yellow → 流向 col0
4. col0 顶层变成 blue，揭示了 h1（blue）和 h2（green）
5. 点 h1（blue） → 9 颗 blue → 现在 col0 顶层是 blue，col2 顶层是 green，col3 顶层是 pink → 只有 col0 接收
6. 点 h2（green） → col1/col2 都能接，分散填入
7. 通关

### Level 3 — Stack Master（创新机制压轴关）

```json
{
  "level_id": 3,
  "name": "Stack Master",
  "difficulty": 3,
  "board_size": { "cols": 5, "rows": 5 },
  "blocks": [
    { "id": "p1", "col": 0, "row": 0, "z": 1, "color": "purple", "is_hidden": false },
    { "id": "p2", "col": 4, "row": 0, "z": 1, "color": "purple", "is_hidden": false },
    { "id": "h1", "col": 0, "row": 0, "z": 0, "color": "orange", "is_hidden": true },
    { "id": "h2", "col": 4, "row": 0, "z": 0, "color": "orange", "is_hidden": true },
    { "id": "c1", "col": 2, "row": 2, "z": 0, "color": "pink",   "is_hidden": false },
    { "id": "c2", "col": 1, "row": 2, "z": 0, "color": "blue",   "is_hidden": false },
    { "id": "c3", "col": 3, "row": 2, "z": 0, "color": "green",  "is_hidden": false },
    { "id": "c4", "col": 2, "row": 1, "z": 0, "color": "yellow", "is_hidden": false }
  ],
  "box_columns": [
    { "col": 0, "boxes": ["purple", "pink", "orange", "yellow", "blue", "green"] },
    { "col": 1, "boxes": ["yellow", "purple", "blue", "orange", "pink", "green"] },
    { "col": 2, "boxes": ["green", "blue", "purple", "yellow", "pink", "orange"] },
    { "col": 3, "boxes": ["pink", "orange", "green", "blue", "purple", "yellow"] }
  ],
  "conveyor_speed": 0.07,
  "gravity_flip_enabled": true,
  "magnet_count": 2
}
```

**校验**：
- 方块数 8 × 9 = 72 颗
- 箱数 6 × 4 = 24 → 24 × 3 = 72 ✅
- purple 方块 2 × 9 = 18 → purple 箱 6 ✅
- orange 方块 2 × 9 = 18 → orange 箱 6 ✅
- pink 方块 1 × 9 = 9 → pink 箱 3 ✅
- blue 方块 1 × 9 = 9 → blue 箱 3 ✅
- green 方块 1 × 9 = 9 → green 箱 3 ✅
- yellow 方块 1 × 9 = 9 → yellow 箱 3 ✅

**设计意图**：
- 6 色全开，最复杂
- 每列 6 个箱子的不同颜色排列 → 玩家必须密切观察 4 列顶层颜色变化
- 速度 0.07（比 Level 2 快 17%）
- 启用重力翻转（Task 06），可以重排板子布局
- 2 个磁铁（Task 05）救场
- 顶层 p1/p2 (purple) 遮挡 h1/h2 (orange)：先清紫色才能看到橙色
- 8 方块 × 9 = 72 颗弹珠，但传送带容量 24 → **同时存在的弹珠数量必须严控**
- 关卡能否通关取决于玩家是否能利用磁铁和翻转维持节奏

**通关大致思路**：
1. 观察 4 列顶层：col0=purple / col1=yellow / col2=green / col3=pink
2. 先点 c1（pink）→ 9 颗流向 col3（唯一接 pink 的列）
3. 点 p1 或 p2（purple）→ 9 颗流向 col0
4. 此时 col0 顶变成 pink，col3 顶变 orange
5. 揭示 h1（orange） → 流向 col3
6. 中间如果传送带满 → 用磁铁干预
7. 重力翻转可以改变方块布局，让被压住的方块更易点（可选策略）

## 关卡卡片视觉信息更新

`LevelSelectScene` 的卡片信息：

| Level | Name | Difficulty | Stars | Hook |
|---|---|---|---|---|
| 01 | Tutorial | Easy | ★☆☆ | Learn the conveyor |
| 02 | Wrong Color, Right Time | Medium | ★★☆ | Time the loops |
| 03 | Stack Master | Hard | ★★★ | All 6 colors, gravity flip + magnet |

## 关卡数据校验脚本（手动跑一次）

实现完关卡 JSON 后，跑一次这个脚本验证：

```javascript
// scripts/validate-levels.mjs
import fs from 'fs';

const levels = [1, 2, 3];

for (const id of levels) {
  const data = JSON.parse(
    fs.readFileSync(`./src/levels/level_0${id}.json`, 'utf-8')
  );
  
  const totalMarbles = data.blocks.length * 9;
  const totalBoxCapacity = data.box_columns.reduce(
    (s, c) => s + c.boxes.length, 0
  ) * 3;
  
  console.log(`Level ${id}: ${data.blocks.length} blocks × 9 = ${totalMarbles} marbles`);
  console.log(`         ${data.box_columns.reduce((s,c)=>s+c.boxes.length,0)} boxes × 3 = ${totalBoxCapacity} capacity`);
  
  if (totalMarbles !== totalBoxCapacity) {
    throw new Error(`Level ${id}: count mismatch`);
  }
  
  // 颜色守恒
  const blockColors = {};
  data.blocks.forEach(b => {
    blockColors[b.color] = (blockColors[b.color] || 0) + 1;
  });
  
  const boxColors = {};
  data.box_columns.forEach(c => {
    c.boxes.forEach(color => {
      boxColors[color] = (boxColors[color] || 0) + 1;
    });
  });
  
  for (const color of new Set([...Object.keys(blockColors), ...Object.keys(boxColors)])) {
    const m = (blockColors[color] || 0) * 9;
    const b = (boxColors[color] || 0) * 3;
    if (m !== b) {
      throw new Error(`Level ${id}, color ${color}: ${m} marbles vs ${b} slots`);
    }
    console.log(`         ${color}: ${m} ✓`);
  }
  console.log('');
}

console.log('All levels valid.');
```

## 验收标准

- [ ] 三个 JSON 文件按新 schema 创建（box_columns、conveyor_speed，无 trays、queue_capacity）
- [ ] validate-levels.mjs 全过
- [ ] LevelSelectScene 显示 3 张卡片，名字和难度匹配
- [ ] 进入 Level 1 → 4 方块、4 列箱（每列 3 个）、传送带速度 0.05、tutorial toast 显示
- [ ] 进入 Level 2 → 4 方块（含遮挡和隐藏）、4 列各 3 个杂色箱
- [ ] 进入 Level 3 → 8 方块（含遮挡和隐藏）、4 列各 6 个箱、可见 FLIP 按钮和 2 颗磁铁
- [ ] 三个关卡都能通关（先无磁铁/翻转纯手动尝试 Level 1，Level 2/3 可用辅助）

## Agent Prompt（直接复制给 Codex）

```
你已经完成了 02c。现在执行 03_v2_LEVELS.md，重新设计 3 个关卡为新 schema。

执行前请按顺序读：
1. specs/00_MASTER_SPEC.md
2. specs/02c_CONVEYOR_BOX.md（关卡 schema 来源）
3. specs/03_v2_LEVELS.md（本任务）

== 任务 ==
1. 删除（git rm）旧的 src/levels/level_01.json / level_02.json / level_03.json
2. 按本文档创建新的三个 JSON 文件
3. 更新 src/scenes/LevelSelectScene.js 里的关卡卡片元数据（名字、难度、hook 描述）
4. 在 src/scenes/GameScene.js 的 levelId=1 入场时显示 Tutorial toast：「Tap blocks to send marbles to the conveyor. Marbles drop into matching boxes below.」5 秒后消失
5. 创建 scripts/validate-levels.mjs（按本文档"关卡数据校验脚本"），并跑一次输出结果

== 硬约束 ==
- 关卡 JSON 中颜色必须是 COLORS 枚举的有效 id（pink/blue/green/yellow/purple/orange）
- 每个 level 必须满足 方块数×9 == 总箱容×3 且每色独立守恒
- 列数固定 4
- 不能有 trays 字段、queue_capacity 字段
- 不要修改其他任务的代码（除非必要的 LevelSelectScene 元数据更新）

== 自验 ==
- 跑 validate-levels.mjs 全过
- Level 1：手动通关一次，确认 36 颗弹珠全部进箱
- Level 2：手动尝试通关，可以失败（中等难度），确认顶层颜色错配机制工作
- Level 3：可不通关，但确认所有方块、磁铁按钮、FLIP 按钮（如启用）都正确加载

== 交付 ==
1. 3 个新 JSON
2. 更新后的 LevelSelectScene.js
3. 更新后的 GameScene.js（仅 tutorial toast 部分）
4. scripts/validate-levels.mjs
5. 校验脚本输出
6. Level 1 通关测试报告
```
