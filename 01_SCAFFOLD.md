# Task 01 — 项目脚手架 + 主菜单 + 选关

> **优先级**：P0（gate）
> **预计工时**：2-3 小时
> **依赖**：无（这是起点）
> **执行前必读**：`00_MASTER_SPEC.md`

## 任务目标

搭建 Phaser 3 项目骨架，实现 BootScene → MenuScene → LevelSelectScene 的导航链路。能用 `python3 -m http.server` 起一个本地服务，浏览器打开能看到主菜单和选关界面。

## 详细规格

### 1. 文件清单（必须创建）

```
marble-sort/
├── index.html
├── src/
│   ├── main.js
│   ├── config/
│   │   ├── constants.js     # 抄 00_MASTER_SPEC.md 第 8 节
│   │   └── colors.js        # 抄 00_MASTER_SPEC.md 第 6 节
│   └── scenes/
│       ├── BootScene.js
│       ├── MenuScene.js
│       └── LevelSelectScene.js
```

### 2. index.html 要求

- 通过 CDN 引入 Phaser 3.70：`https://cdn.jsdelivr.net/npm/phaser@3.70.0/dist/phaser.min.js`
- `<script type="module" src="src/main.js"></script>`
- body 背景设为深色（`#1a1a2e`），canvas 居中
- viewport meta 加上 `user-scalable=no`，防移动端缩放

### 3. main.js 要求

- 导入所有 scenes 并注册到 Phaser config
- 启动 BootScene
- 配置项：
  ```js
  {
    type: Phaser.AUTO,
    width: 720,
    height: 1280,
    parent: 'game-container',
    backgroundColor: '#1a1a2e',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics: { default: 'arcade', arcade: { gravity: { y: 600 }, debug: false } }
  }
  ```

### 4. BootScene.js 要求

- `preload()`：暂时不需要加载外部资源（后续任务会加）
- `create()`：直接 `this.scene.start('MenuScene')`

### 5. MenuScene.js 要求

视觉布局（自上而下）：
- 顶部 Y=200：游戏标题 "Marble Sort!" 字号 72，白色，粗体
- 副标题 Y=290：字号 28，"Tap. Match. Sort." 浅灰色
- 中间 Y=600：大按钮 "PLAY"（宽 400 高 100，圆角 24，亮色背景如 `#ff6b9d`），点击跳转 `LevelSelectScene`
- 中间 Y=740：次级按钮 "LEVEL EDITOR"（宽 400 高 80，深色背景），点击跳转 `EditorScene`（**注意**：此阶段 EditorScene 还不存在，先注释掉跳转或显示 "Coming Soon" toast）
- 底部 Y=1200：版权小字 "Made for Voodoo Game Jam 2026"

按钮交互：
- hover 时按钮放大到 1.05（用 Tween）
- 按下时缩小到 0.95
- 用 Phaser 的 `Graphics` 或 `Rectangle` 绘制按钮背景，文本用 `Text` 对象叠加

### 6. LevelSelectScene.js 要求

视觉布局：
- 顶部 Y=100：返回箭头（左上角 50,50），点击回 MenuScene
- 顶部 Y=160：标题 "SELECT LEVEL" 字号 48
- 中间区域：3 个关卡卡片，竖向排列
  - 每个卡片：宽 560 高 200，圆角，居中（X=360）
  - Y 坐标：380 / 620 / 860
  - 卡片内容：左侧大数字 "01"/"02"/"03"，右侧关卡名 "Tutorial"/"Layered"/"Gravity Flip"，难度星级（1/2/3 颗星）
- 点击卡片：调用 `this.scene.start('GameScene', { levelId: 1 })`（**注意**：此阶段 GameScene 还不存在，先 console.log 即可）

### 7. 视觉风格基调（重要，影响后续所有 Scene）

- 字体：用浏览器默认 sans-serif，但所有 Text 设 `fontStyle: 'bold'`
- 调色板（深色 UI）：
  - 背景：`#1a1a2e`
  - 卡片背景：`#2d2d44`
  - 主色（按钮、强调）：`#ff6b9d`（粉）
  - 文字：`#ffffff`
  - 次级文字：`#a0a0b8`
- 所有按钮和卡片用 `setInteractive()` + `pointerover`/`pointerout`/`pointerdown`/`pointerup` 事件做反馈

## 验收标准

执行：
```bash
cd marble-sort
python3 -m http.server 8000
```

浏览器打开 `http://localhost:8000`，应该：

- [ ] 看到主菜单，标题 "Marble Sort!" 居中显示
- [ ] PLAY 按钮 hover 时有放大动画
- [ ] 点击 PLAY 跳转到选关界面
- [ ] 选关界面看到 3 个关卡卡片，编号 01/02/03
- [ ] 点击关卡卡片，console 输出 `Starting level 1` 之类
- [ ] 点击返回箭头能回到主菜单
- [ ] 点击 LEVEL EDITOR 显示 "Coming Soon" 或不报错

## Agent Prompt（直接复制给 Codex）

```
You are setting up a Phaser 3 project for a browser puzzle game called "Marble Sort!" for a 30-hour Voodoo game jam.

Read /path/to/00_MASTER_SPEC.md first for shared context. Then implement Task 01 per /path/to/01_SCAFFOLD.md.

Strict rules:
- Phaser 3.70 via CDN, no npm/build tools
- Vanilla JavaScript, ES Modules
- No React, no Vue, no TypeScript, no bundler
- No external image assets — draw all UI with Phaser Graphics or Text
- Must follow the directory structure in 00_MASTER_SPEC.md section 5 exactly
- Use CONFIG constants from src/config/constants.js, never hardcode dimensions
- After implementation, output the exact manual test steps to verify the work

Deliver:
1. All files listed in section 1
2. A README snippet with how to run locally (python3 -m http.server)
3. A checklist confirming each acceptance criterion
```
