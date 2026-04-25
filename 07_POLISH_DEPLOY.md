# Task 07 — 视觉打磨 + itch.io 部署

> **优先级**：P2（最后做，但关系到评委第一印象）
> **预计工时**：3-4 小时
> **依赖**：Task 01-06 全部完成
> **执行前必读**：`00_MASTER_SPEC.md`

## 任务目标

为已经完整的游戏加入"juiciness"（粒子、震动、音效、过渡），打包并部署到 itch.io。这是 Voodoo 评委评 **Product Quality** 的关键。

## 设计哲学

> "A polished 3-level game with 0 bugs > a flashy 10-level game with jank."
>
> — Voodoo Track Tips

不要试图加新内容。所有时间花在让**已有内容**显得更精致。

## 详细规格

### 1. 粒子效果

#### 1.1 方块碎裂粒子

`Block.shatter()` 时触发。

```javascript
shatter() {
  const colorHex = COLORS[this.data.color].hex;
  const x = this.container.x;
  const y = this.container.y;
  
  // 创建粒子贴图（如果没注册过）
  if (!this.scene.textures.exists('particle')) {
    const g = this.scene.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffffff, 1);
    g.fillCircle(8, 8, 8);
    g.generateTexture('particle', 16, 16);
    g.destroy();
  }
  
  // Phaser 3.60+ 的 particles API
  const emitter = this.scene.add.particles(x, y, 'particle', {
    speed: { min: 200, max: 400 },
    angle: { min: 0, max: 360 },
    scale: { start: 0.8, end: 0 },
    lifespan: 500,
    quantity: 12,
    tint: colorHex
  });
  
  // 单次爆发后销毁
  this.scene.time.delayedCall(50, () => emitter.stop());
  this.scene.time.delayedCall(600, () => emitter.destroy());
  
  // 方块本身淡出
  this.scene.tweens.add({
    targets: this.container,
    scale: 0,
    alpha: 0,
    duration: 200,
    ease: 'Back.easeIn',
    onComplete: () => {
      this.container.destroy();
    }
  });
  
  this.isCleared = true;
}
```

#### 1.2 Tray 完成特效

`Tray._onComplete()` 时：

```javascript
_onComplete() {
  // 1. Tray 变金色
  this.scene.tweens.add({
    targets: this.bgGraphics,
    duration: 300,
    onUpdate: tween => {
      // 颜色插值 当前色 → 金色
    }
  });
  
  // 2. 上下弹跳
  this.scene.tweens.add({
    targets: this.container,
    y: this.y - 30,
    yoyo: true,
    duration: 250,
    ease: 'Cubic.easeOut'
  });
  
  // 3. 屏幕微震
  this.scene.cameras.main.shake(150, 0.005);
  
  // 4. 星星爆发
  for (let i = 0; i < 8; i++) {
    const star = this.scene.add.text(this.x, this.y, '✨', { fontSize: 28 });
    const angle = (i / 8) * Math.PI * 2;
    this.scene.tweens.add({
      targets: star,
      x: this.x + Math.cos(angle) * 100,
      y: this.y + Math.sin(angle) * 100,
      alpha: 0,
      duration: 600,
      ease: 'Cubic.easeOut',
      onComplete: () => star.destroy()
    });
  }
  
  this.scene.events.emit('tray-completed', this);
}
```

#### 1.3 弹珠入 Tray 时的小弹跳

`Tray.addMarble()` 现有的 scale bounce 动画基础上，加一个轻微的颜色脉冲：

```javascript
addMarble(marble) {
  // 现有缩放代码...
  
  // 颜色脉冲（背景闪一下白）
  this.scene.tweens.add({
    targets: this.highlightOverlay,  // 一个白色全覆盖的半透明 rect
    alpha: { from: 0.5, to: 0 },
    duration: 200
  });
}
```

### 2. 音效（极简方案）

不要找音效文件资源（30 小时不值得）。用 **Web Audio API 程序合成**简单音效：

`src/utils/sfx.js`：
```javascript
let audioCtx;

function ensureCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

export function playPop(pitch = 1) {
  const ctx = ensureCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(400 * pitch, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(800 * pitch, ctx.currentTime + 0.05);
  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.15);
}

export function playClear() {
  const ctx = ensureCtx();
  // 上行琶音 C-E-G
  [523, 659, 784].forEach((freq, i) => {
    setTimeout(() => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    }, i * 80);
  });
}

export function playWin() {
  const ctx = ensureCtx();
  [523, 659, 784, 1046].forEach((freq, i) => {
    setTimeout(() => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    }, i * 100);
  });
}

export function playFail() {
  const ctx = ensureCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(220, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.4);
  gain.gain.setValueAtTime(0.15, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.4);
}
```

调用点：
- `Block.shatter()` → `playPop()`，pitch 根据颜色微调（0.8 - 1.2）
- `Tray._onComplete()` → `playClear()`
- `GameScene._checkVictory()` 通关 → `playWin()`
- `GameScene._onGameOver()` → `playFail()`
- `Magnet.activate()` → 一个低频 swoosh 音

### 3. 主菜单/选关界面打磨

#### 3.1 主菜单背景动画

让标题文字微微浮动：
```javascript
this.tweens.add({
  targets: titleText,
  y: titleText.y + 8,
  yoyo: true,
  repeat: -1,
  duration: 2000,
  ease: 'Sine.easeInOut'
});
```

加几个背景装饰弹珠（不同颜色的圆，缓慢移动）：
```javascript
for (let i = 0; i < 8; i++) {
  const colors = Object.values(COLORS).map(c => c.hex);
  const decor = this.add.circle(
    Phaser.Math.Between(0, 720),
    Phaser.Math.Between(0, 1280),
    Phaser.Math.Between(20, 50),
    Phaser.Math.RND.pick(colors),
    0.15
  );
  this.tweens.add({
    targets: decor,
    y: decor.y - 100,
    yoyo: true,
    repeat: -1,
    duration: Phaser.Math.Between(3000, 6000),
    ease: 'Sine.easeInOut'
  });
}
```

#### 3.2 GameOverScene 打磨

胜利场景：
- "LEVEL CLEAR!" 大字从上方掉落 + 弹跳
- 周围烟花粒子
- 显示通关用时（可选）
- "NEXT" 按钮（如果还有下一关）+ "MENU" 按钮

失败场景：
- "OUT OF SPACE!" 字红色 + 摇晃
- 屏幕微微变红
- "RETRY" 主按钮 + "MENU" 次按钮

### 4. 场景过渡

每个 `scene.start(...)` 调用前加淡入淡出：

```javascript
transitionTo(targetScene, data) {
  this.cameras.main.fadeOut(300, 0, 0, 0);
  this.cameras.main.once('camerafadeoutcomplete', () => {
    this.scene.start(targetScene, data);
  });
}

// 每个 scene 的 create() 开头
this.cameras.main.fadeIn(300, 0, 0, 0);
```

### 5. 移动端触屏优化

加在 index.html：
```html
<style>
  body, html { 
    margin: 0; padding: 0; 
    overflow: hidden;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
  }
  #game-container { 
    width: 100vw; height: 100vh; 
    display: flex; align-items: center; justify-content: center;
  }
</style>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
```

确保：
- 所有可点击元素至少 64×64
- 颜色选择菜单的色环半径加大到 36（手指点更稳）

### 6. 性能与稳定性 checklist

完成所有任务后，跑一遍这个 checklist：

- [ ] 浏览器 Console 没有任何 error 或 warning
- [ ] 在 Chrome DevTools Performance 面板录 30 秒游戏，FPS 稳定在 60
- [ ] 内存：玩 5 关后内存增长不超过 20MB（particles 等被正确销毁）
- [ ] 在 Safari 上能跑（不要用 Chrome-only API）
- [ ] 在手机浏览器（iOS Safari + Android Chrome）能跑
- [ ] Reload 页面 10 次，每次状态正常
- [ ] 故意输 → 重试 → 通关 → 回菜单 → 再玩，状态干净

### 7. itch.io 部署

#### 7.1 打包

```bash
# 在 marble-sort 根目录
zip -r marble-sort.zip . -x "*.DS_Store" "node_modules/*" ".git/*" "*.md"
```

确保 zip 里 `index.html` 在**根目录**（不要套一层文件夹）。

#### 7.2 itch.io 上传步骤

1. 注册/登录 itch.io
2. Dashboard → "Create new project"
3. 设置：
   - Title: `Marble Sort!`
   - Project URL: 自动
   - Classification: `Games`
   - Kind of project: `HTML`
   - Genre: `Puzzle`
4. Uploads 区域：
   - 上传 zip
   - 勾选 "This file will be played in the browser"
5. Embed options:
   - Viewport dimensions: `720 × 1280`
   - 勾选 `Mobile friendly`
   - 勾选 `Automatically start on page load`（可选）
   - 勾选 `Fullscreen button`
6. 描述：写一段简短的游戏说明（中英双语）
   ```
   Tap colored blocks to shatter them into marbles.
   Match the colors to the trays below before the queue clogs up!
   
   ✨ Created in 30 hours for the Voodoo Game Jam 2026
   🎮 3 levels of increasing difficulty
   🧲 Magnet booster + Gravity Flip mechanic
   📝 Built-in level editor — make your own challenges!
   
   Built with Phaser 3 + AI agents (Claude + Codex).
   ```
7. Cover image：用 Scenario 生成一张 630×500 封面图
8. 设为 `Public` 或 `Restricted`（jam 期间用 restricted + 私链给评委）

#### 7.3 itch.io 链接结构

提交时给评委：
- 游戏链接：`https://yourname.itch.io/marble-sort`
- 备用录屏链接（YouTube / Loom 都行，3 分钟内）

### 8. README.md（仓库根目录）

```markdown
# Marble Sort!

A physics-based puzzle game built in 30 hours for the Voodoo Game Jam 2026.

## Play
- Online: https://yourname.itch.io/marble-sort
- Local: `python3 -m http.server 8000` then open http://localhost:8000

## Features
- ✅ 3 levels with increasing difficulty
- ✅ Built-in level editor
- ✅ Magnet booster (creativity)
- ✅ Gravity flip mechanic (creativity)
- ✅ Browser + mobile friendly

## Stack
- Phaser 3.70 (CDN)
- Vanilla JavaScript (ES Modules)
- No build step

## Development
~75% of code authored by AI agents (Claude Opus + Codex).
See `/specs` for the task breakdown given to agents.

## Team
- Dev: [name]
- Visual: [name]  
- Creative & Pre: [name]
```

## 验收标准

- [ ] 方块碎裂时有粒子爆发（颜色匹配）
- [ ] Tray 完成时有星星 + 弹跳 + 屏幕震动
- [ ] 所有关键交互都有音效（pop / clear / win / fail）
- [ ] 主菜单标题有浮动动画 + 背景装饰弹珠
- [ ] 场景切换有淡入淡出
- [ ] 移动端能正常游玩（用 Chrome DevTools 模拟 iPhone 12 Pro 测试）
- [ ] FPS 稳定 60
- [ ] Console 零 error
- [ ] zip 包准备好
- [ ] itch.io 项目页面创建并上传成功
- [ ] 游戏在 itch.io 嵌入页能正常加载和游玩

## Agent Prompt（直接复制给 Codex）

```
You are doing the final polish pass on "Marble Sort!" per 07_POLISH_DEPLOY.md.

Read 00_MASTER_SPEC.md first. All previous tasks (01-06) are complete. Do NOT add new features. Only enhance existing ones.

Strict rules:
- DO NOT introduce sound files. Use Web Audio API synthesis only (sfx.js pattern provided).
- DO NOT introduce image assets. Use Phaser Graphics or emoji.
- All new tweens/particles must clean up after themselves (call .destroy() in onComplete).
- Test on mobile viewport (Chrome DevTools iPhone 12 Pro emulation) before declaring done.

Tasks in order:
1. Create src/utils/sfx.js with the 4 synth functions
2. Wire sfx into Block.shatter, Tray._onComplete, GameScene victory/loss, Magnet activate
3. Add particle effects to Block.shatter (12 particles, color-tinted)
4. Polish Tray._onComplete with stars, bounce, shake
5. Polish MenuScene with floating title and decorative marbles
6. Polish GameOverScene win/lose states
7. Add fadeOut/fadeIn transitions between scenes
8. Verify mobile responsiveness (touch-action: none, viewport meta)
9. Run the performance & stability checklist (section 6)
10. Build the deployment zip and prepare itch.io upload metadata

Deliver:
1. sfx.js + all polish updates
2. Performance checklist results
3. Deployment zip at marble-sort.zip
4. itch.io project description text (ready to paste)
5. README.md
```
