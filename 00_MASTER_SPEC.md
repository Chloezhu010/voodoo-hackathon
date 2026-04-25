# Marble Sort! — Master Spec (Read First)

> 所有子任务 MD 的共享上下文。任何 Codex agent 在执行子任务前，必须先读这份。

## 1. 项目目标

为 **Voodoo 30小时 Game Jam — Track 1 (Physics-Based Puzzle)** 开发一个浏览器游戏 **Marble Sort!**，参考 Voodoo 同名游戏的核心循环，加入两个原创机制（磁铁 Booster + 重力翻转关卡）。

## 2. 必须命中的硬性指标（Track Minimum Requirements）

这些是 gate，缺一项直接出局：

- [x] 核心机制可玩、有上瘾感
- [x] **至少 3 个关卡**，难度递增
- [x] **关卡编辑器**，能创建或修改关卡
- [x] 浏览器可玩（itch.io 部署）

## 3. 核心循环（Core Loop）

```
玩家点击棋盘上未被遮挡的彩色方块
   ↓
方块碎裂成 6 颗对应颜色的弹珠
   ↓
弹珠通过漏斗（视觉 tween）按顺序进入底部队列轨道
   ↓
队列轨道里的弹珠，如果颜色匹配底部 Target Tray，则飞向 Tray，Tray 计数 +1
   ↓
Tray 集齐 6 颗 → Tray 完成（消失或变金）
   ↓
所有 Tray 完成 → 关卡通过
   ↓
[失败条件] 队列轨道塞满（容量 = 12 颗弹珠）→ Game Over
```

**关键 puzzle 张力**：
- 板子上有 `?` 隐藏方块，被其它方块遮挡时不可见，需要先清掉上层才能揭示
- 玩家可能为了揭示底层 `?` 而被迫点击当前没有 Tray 需求的颜色 → 这些弹珠会卡在队列里占位
- 队列容量是稀缺资源，玩家需要规划点击顺序

## 4. 技术栈（不可改）

| 层 | 选型 | 理由 |
|---|---|---|
| 框架 | **Phaser 3.70+** | AI 训练数据覆盖最广，文档稳定，Scene 管理省事 |
| 物理 | **Phaser Arcade Physics**（内置） | 不引入 Matter.js。我们只需要重力 + 简单碰撞，Arcade 零调参 |
| 语言 | **Vanilla JavaScript (ES Modules)** | 不上 React/Vue/TS。30 小时跑构建链是浪费 |
| 资源 | Scenario AI（艺术资源）+ 纯 Phaser Graphics（Pop-it 方块用代码绘制即可） | |
| 部署 | itch.io（HTML5 zip 上传） | |

**Phaser CDN 引入方式**：
```html
<script src="https://cdn.jsdelivr.net/npm/phaser@3.70.0/dist/phaser.min.js"></script>
```

## 5. 项目目录结构（强制约定）

```
marble-sort/
├── index.html                # 入口
├── src/
│   ├── main.js               # Phaser 配置 + scene 注册
│   ├── config/
│   │   ├── constants.js      # 全局常量（颜色、尺寸、容量等）
│   │   └── colors.js         # 颜色枚举
│   ├── scenes/
│   │   ├── BootScene.js      # 资源加载
│   │   ├── MenuScene.js      # 主菜单
│   │   ├── LevelSelectScene.js
│   │   ├── GameScene.js      # 核心玩法
│   │   ├── EditorScene.js    # 关卡编辑器
│   │   └── GameOverScene.js  # 失败/胜利
│   ├── entities/
│   │   ├── Block.js          # 方块（逻辑 + 渲染）
│   │   ├── Marble.js         # 弹珠
│   │   ├── Queue.js          # 队列管理器
│   │   ├── Tray.js           # 目标托盘
│   │   └── Funnel.js         # 漏斗（视觉）
│   ├── systems/
│   │   ├── BoardManager.js   # 棋盘逻辑（遮挡判定、点击响应）
│   │   ├── LevelLoader.js    # 关卡 JSON 加载/解析
│   │   └── GravityFlip.js    # 重力翻转机制（创新点 2）
│   ├── boosters/
│   │   └── Magnet.js         # 磁铁 Booster（创新点 1）
│   └── levels/
│       ├── level_01.json
│       ├── level_02.json
│       └── level_03.json
└── assets/                   # 图片/音效（可后期加）
```

## 6. 颜色系统（全项目统一）

```javascript
// src/config/colors.js
export const COLORS = {
  PINK:   { id: 'pink',   hex: 0xff6b9d, label: '粉' },
  BLUE:   { id: 'blue',   hex: 0x4ec5f1, label: '蓝' },
  GREEN:  { id: 'green',  hex: 0x7ed957, label: '绿' },
  YELLOW: { id: 'yellow', hex: 0xffd93d, label: '黄' },
  PURPLE: { id: 'purple', hex: 0xa56ef0, label: '紫' },
  ORANGE: { id: 'orange', hex: 0xff9a3c, label: '橙' }
};
```

Level 1 只用 3 色（pink/blue/green），Level 2 用 4 色，Level 3 用 6 色全。

## 7. 关卡 JSON 格式（强制规范）

```json
{
  "level_id": 1,
  "name": "Tutorial",
  "board_size": { "cols": 5, "rows": 5 },
  "blocks": [
    {
      "id": "b1",
      "col": 0,
      "row": 0,
      "z": 0,
      "color": "pink",
      "is_hidden": false
    }
  ],
  "trays": [
    { "color": "pink", "capacity": 6 },
    { "color": "blue", "capacity": 6 }
  ],
  "queue_capacity": 12,
  "gravity_flip_enabled": false,
  "magnet_count": 0
}
```

**字段说明**：
- `z`：层级。值越大越靠上层（越靠前），遮挡 z 更小的同位置方块
- `is_hidden`：是否是 `?` 方块。true 表示被遮挡时显示问号，揭示后才显示真实颜色
- `gravity_flip_enabled`：本关是否启用重力翻转（仅 Level 3 设为 true）
- `magnet_count`：本关初始磁铁 Booster 数量

## 8. 全局常量（src/config/constants.js）

```javascript
export const CONFIG = {
  GAME_WIDTH: 720,
  GAME_HEIGHT: 1280,        // 竖屏，模拟手游
  BLOCK_SIZE: 96,
  MARBLES_PER_BLOCK: 6,
  MARBLE_RADIUS: 14,
  QUEUE_CAPACITY_DEFAULT: 12,
  TRAY_CAPACITY: 6,
  
  // 区域分布（顶到底）
  HEADER_HEIGHT: 80,
  BOARD_AREA: { x: 60, y: 120, width: 600, height: 600 },
  FUNNEL_AREA: { x: 200, y: 740, width: 320, height: 100 },
  QUEUE_AREA: { x: 80, y: 860, width: 560, height: 80 },
  TRAY_AREA: { x: 80, y: 980, width: 560, height: 200 },
  
  // 时序
  MARBLE_FALL_DURATION: 600,
  MARBLE_TO_TRAY_DURATION: 400,
};
```

## 9. 评分维度对应策略

| 评分维度 | 我们怎么打 |
|---|---|
| Technical Robustness | 不用 Matter.js，确定性掉落，避免物理 bug；每个 Scene 独立可测 |
| Product Quality | 严格还原 reference 的 tap → 6 marbles → queue → tray 节奏；Pop-it 视觉 |
| AI Usage | 全程 Codex agent 驱动；每个子任务都是独立 MD，便于展示 AI 工作流 |
| Creativity | 磁铁 Booster（深度版）+ 重力翻转关卡 |

## 10. 子任务清单与依赖

| # | 任务 | 文件 | 依赖 | 优先级 |
|---|---|---|---|---|
| 1 | 项目脚手架 + 主菜单 + 选关 | `01_SCAFFOLD.md` | 无 | P0 |
| 2 | 核心玩法（棋盘+点击+队列+托盘） | `02_CORE_GAMEPLAY.md` | 1 | P0 |
| 3 | 3 个关卡数据 | `03_LEVELS.md` | 2 | P0 |
| 4 | 关卡编辑器 | `04_EDITOR.md` | 1, 2 | P0 |
| 5 | 磁铁 Booster | `05_MAGNET.md` | 2 | P1 |
| 6 | 重力翻转机制 | `06_GRAVITY_FLIP.md` | 2 | P1 |
| 7 | 视觉打磨 + 部署 | `07_POLISH_DEPLOY.md` | 全部 | P2 |

**P0 是 Track 硬性 gate，必须最先全部完成。P1 是创新分。P2 是体验分。**

## 11. 给 Codex Agent 的通用规则

每个子任务 MD 末尾都有一段 **Agent Prompt**，将该段直接复制给 Codex。

通用规则：
1. **绝对不要引入 Matter.js**，物理只用 Phaser Arcade
2. **绝对不要引入 React/Vue/TypeScript/构建工具**，纯 Vanilla JS + ES Modules
3. **方块和弹珠的视觉用 Phaser Graphics 代码绘制**，不要依赖外部图片
4. 所有坐标和尺寸引用 `CONFIG` 常量，不要硬编码
5. 每个 Scene/Class 一个文件，文件名首字母大写
6. 写完一个任务后必须给出**手动验收步骤**（"打开 index.html，应该看到..."）
