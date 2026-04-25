# Task 07_v2 — 视觉打磨 + itch.io 部署（传送带版）

> **优先级**：P2（最后做，但关系到评委第一印象）
> **预计工时**：3-4 小时
> **依赖**：02c-06_v2 全部完成
> **执行前必读**：`00_MASTER_SPEC.md`, `02c_CONVEYOR_BOX.md`, `07_POLISH_DEPLOY.md`（旧版）

## 改动范围

旧版 07 的大部分仍然有效：
- 主菜单浮动标题、装饰弹珠
- 场景过渡 fadeIn/fadeOut
- GameOver 视觉
- Web Audio API 音效合成
- 移动端响应式 + viewport
- 性能 checklist
- itch.io 打包部署

**本任务在旧版基础上新增 6 类视觉特效**——都是为新核心机制服务的：

1. 方块碎裂粒子（沿用旧版）
2. **箱子装满消失爆炸**（新）
3. **整列上移弹簧动画**（新）
4. **传送带容量警戒丝带**（新）
5. **OutputPort 颜色染色脉冲**（新）
6. **Conveyor 滚动动画**（新）

## 详细规格

### 1. 方块碎裂粒子（沿用旧版 07）

`Block.shatter()` 中的 12 颗粒子爆发，沿用旧版代码。但 **粒子数从 12 改为 18**（因为现在每方块产生 9 颗弹珠，粒子要更多）。

### 2. 箱子装满消失爆炸（新）

`Box.destroyWithAnimation()` 中加入：

```javascript
destroyWithAnimation(onComplete) {
  // ⚠ 新增：粒子爆发
  const colorHex = COLORS[this.color].hex;
  const x = this.container.x;
  const y = this.container.y;
  
  if (!this.scene.textures.exists('boxParticle')) {
    const g = this.scene.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffffff, 1);
    g.fillCircle(6, 6, 6);
    g.generateTexture('boxParticle', 12, 12);
    g.destroy();
  }
  
  const emitter = this.scene.add.particles(x, y, 'boxParticle', {
    speed: { min: 150, max: 350 },
    angle: { min: 0, max: 360 },
    scale: { start: 0.6, end: 0 },
    lifespan: 600,
    quantity: 16,
    tint: colorHex,
    gravityY: 200
  });
  this.scene.time.delayedCall(50, () => emitter.stop());
  this.scene.time.delayedCall(800, () => emitter.destroy());
  
  // ⚠ 新增：闪光（白色脉冲）
  const flash = this.scene.add.graphics();
  flash.fillStyle(0xffffff, 0.8);
  flash.fillRoundedRect(
    -CONFIG.BOX_COLUMNS.BOX_WIDTH/2,
    -CONFIG.BOX_COLUMNS.BOX_HEIGHT/2,
    CONFIG.BOX_COLUMNS.BOX_WIDTH,
    CONFIG.BOX_COLUMNS.BOX_HEIGHT,
    8
  );
  flash.x = x;
  flash.y = y;
  this.scene.tweens.add({
    targets: flash,
    alpha: 0,
    scale: 1.5,
    duration: 200,
    onComplete: () => flash.destroy()
  });
  
  // 屏幕震动
  this.scene.cameras.main.shake(80, 0.004);
  
  // 原有的 box container 缩放消失动画
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
  
  // 触发音效
  if (window.playClear) window.playClear();
}
```

### 3. 整列上移弹簧动画（新）

`BoxColumn.onBoxFull()` 中的 `tweenPosition` 改为弹簧曲线：

```javascript
onBoxFull(box) {
  // ... 顶层弹出 + destroy
  
  const h = CONFIG.BOX_COLUMNS.BOX_HEIGHT;
  const gap = CONFIG.BOX_COLUMNS.BOX_GAP;
  const area = CONFIG.BOX_COLUMNS.AREA;
  const topY = area.y + h / 2;
  
  this.boxes.forEach((b, i) => {
    // ⚠ 改：用 Back.easeOut 而不是 Cubic.easeOut，加 elastic 效果
    this.scene.tweens.add({
      targets: b.container,
      y: topY + i * (h + gap),
      duration: 400,
      delay: i * 30,        // 错峰，从顶到底依次启动
      ease: 'Back.easeOut'
    });
  });
}
```

效果：箱子上移时有轻微的"过冲然后回弹"反馈，像物理弹簧。

### 4. 传送带容量警戒丝带（新）

当传送带占用率超过阈值时，传送带边框显示警戒色：

```javascript
// Conveyor.js 中加
update(dt) {
  if (this.isPaused) return;
  
  // ... 原有的弹珠 t 推进 + 输出口检测
  
  this._refreshCapacityWarning();
}

_refreshCapacityWarning() {
  const ratio = this.marbles.length / CONFIG.CONVEYOR.TOTAL_CAPACITY;
  
  if (ratio > 0.85) {
    // 红色警戒（超过 20/24）
    if (!this._warningTween) {
      this._warningTween = this.scene.tweens.add({
        targets: this.trackOutline,  // 新增 graphics 对象，半透明红色描边
        alpha: { from: 0.4, to: 0.9 },
        duration: 300,
        yoyo: true,
        repeat: -1
      });
    }
  } else if (ratio > 0.6) {
    // 黄色提醒（15-20/24）
    this.trackOutline.setStrokeStyle(4, 0xffaa00, 0.6);
    if (this._warningTween) {
      this._warningTween.stop();
      this._warningTween = null;
    }
  } else {
    // 安全（< 15/24）
    this.trackOutline.setStrokeStyle(4, 0x4a4a5e, 0.3);
    if (this._warningTween) {
      this._warningTween.stop();
      this._warningTween = null;
    }
  }
}
```

`_renderTrack()` 末尾加：

```javascript
this.trackOutline = this.scene.add.graphics();
this.trackOutline.setStrokeStyle(4, 0x4a4a5e, 0.3);
// 沿轨道路径画一圈高亮描边（绿色变红色用作警戒）
this._drawOutlinePath(this.trackOutline);
```

### 5. OutputPort 颜色染色脉冲（新）

每次顶层箱变化（消失上移）时，新的 OutputPort 颜色脉冲一下吸引注意：

```javascript
// OutputPort.js
notifyColumnChanged() {
  this._refreshGateColor();
  
  // ⚠ 新增：颜色脉冲
  this.scene.tweens.add({
    targets: this.gateGraphics,
    scale: { from: 1.4, to: 1 },
    alpha: { from: 0.5, to: 1 },
    duration: 400,
    ease: 'Cubic.easeOut'
  });
}
```

### 6. Conveyor 滚动视觉（新）

传送带视觉上要有"滚动感"，让玩家感觉它在转。

最简方案：在传送带轨道上画一系列**纹理标记**（比如等距的 V 形箭头），让箭头跟随 speed 在 t 上推进。

```javascript
// Conveyor.js
_renderTrack() {
  // ... 原有的轨道描边
  
  // ⚠ 新增：滚动标记
  this.scrollMarkers = [];
  for (let i = 0; i < 12; i++) {
    const marker = this.scene.add.graphics();
    marker.lineStyle(3, 0x6a6a7e, 0.5);
    marker.beginPath();
    marker.moveTo(-6, -3);
    marker.lineTo(0, 3);
    marker.lineTo(6, -3);
    marker.strokePath();
    this.scrollMarkers.push({
      graphics: marker,
      t: i / 12  // 均匀分布
    });
  }
}

update(dt) {
  if (this.isPaused) return;
  const dts = dt / 1000;
  const advance = this.speed * dts;
  
  // ... 弹珠 t 推进
  
  // ⚠ 新增：滚动标记跟随推进
  this.scrollMarkers.forEach(m => {
    m.t = (m.t + advance) % 1;
    const pos = this.track.positionAt(m.t);
    m.graphics.x = pos.x;
    m.graphics.y = pos.y;
    
    // 根据当前在哪段轨道，调整箭头方向
    const angle = this._getTangentAngle(m.t);
    m.graphics.rotation = angle;
  });
  
  this._refreshCapacityWarning();
}

_getTangentAngle(t) {
  // 上层：水平向右 → angle 0
  // 右弧：从右上转到右下 → angle 0 → π/2
  // 下层：水平向左 → angle π
  // 左弧：从左下转到左上 → angle π → -π/2
  if (t < 0.40) return 0;
  if (t < 0.50) return ((t - 0.40) / 0.10) * Math.PI / 2;
  if (t < 0.90) return Math.PI;
  return Math.PI + ((t - 0.90) / 0.10) * Math.PI / 2;
}
```

### 7. 音效新增（在旧版基础上）

`src/utils/sfx.js` 中新增：

```javascript
export function playBoxClear() {
  // 类似 playClear 但音色更脆
  const ctx = ensureCtx();
  [659, 880, 1175].forEach((freq, i) => {
    setTimeout(() => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    }, i * 50);
  });
}

export function playMarbleDrop() {
  // 弹珠掉进箱子的轻微 "tap"
  const ctx = ensureCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 600 + Math.random() * 200;
  gain.gain.setValueAtTime(0.08, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.08);
}

export function playWarning() {
  // 容量警戒 ascending beep
  const ctx = ensureCtx();
  [200, 250, 300].forEach((freq, i) => {
    setTimeout(() => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    }, i * 100);
  });
}
```

调用点：
- `Box.destroyWithAnimation` → `playBoxClear()`（替代旧版的 playClear）
- `Box.fillVisualSlot` → `playMarbleDrop()`
- `Conveyor._refreshCapacityWarning` 第一次进入红色警戒时 → `playWarning()`（用 flag 防止持续响）

### 8. 主菜单的小调整

旧版主菜单背景有"装饰弹珠"漂浮。**改成"装饰传送带"**——在主菜单背景画一个小型循环传送带，带几颗彩色弹珠转动。视觉上跟核心玩法呼应。

具体实现：直接在 MenuScene 实例化一个简化版的 Conveyor + 几颗 fake Marble，不连接任何逻辑，纯装饰。

## itch.io 描述更新

```
🎮 Marble Sort: Loop & Stack

Drop colored marbles onto a looping conveyor belt — each marble waits for its matching box to appear at the top of a column. Boxes fill 3 marbles, vanish, and reveal the next color underneath.

✨ A 30-hour Voodoo Game Jam 2026 entry blending the conveyor mechanics of Beads Out with the box-stacking logic of Marble Sort.

Features:
- 3 levels with progressive difficulty
- Built-in level editor with real-time validation
- Magnet booster: snap matching marbles instantly to their boxes
- Gravity flip mechanic on Level 3: rotate the board 90° to unlock new strategies
- Browser + mobile friendly

Built with Phaser 3 + AI agents (Claude + Codex).
```

## 验收标准

- [ ] 方块碎裂时 18 颗粒子爆发
- [ ] 箱子装满消失时有 16 颗白色粒子 + 闪光 + 屏幕震动
- [ ] 整列上移有 Back.easeOut 弹簧曲线，错峰启动
- [ ] 传送带占用率 > 60% 时边框变黄，> 85% 时变红闪烁
- [ ] OutputPort 颜色变化时有缩放脉冲反馈
- [ ] 传送带上有 12 个滚动箭头标记，匀速跟着传送带方向移动
- [ ] 各类音效正确触发，无重叠混乱
- [ ] 主菜单背景有装饰性循环传送带
- [ ] 移动端能正常游玩
- [ ] FPS 稳定 60
- [ ] Console 零 error
- [ ] zip 包准备好上 itch.io

## Agent Prompt（直接复制给 Codex）

```
你已经完成了 02c-06_v2 全部 P0 + P1 任务。现在执行 07_v2_POLISH_DEPLOY.md 做最终打磨和部署。

执行前请按顺序读：
1. specs/00_MASTER_SPEC.md
2. specs/02c_CONVEYOR_BOX.md
3. specs/07_POLISH_DEPLOY.md（旧版，部分仍有效）
4. specs/07_v2_POLISH_DEPLOY.md（本任务）

== 任务 ==
按本文档 8 个小节顺序实施：
1. Block.shatter 粒子数从 12 改 18
2. Box.destroyWithAnimation 加粒子 + 闪光 + 震动
3. BoxColumn.onBoxFull 用 Back.easeOut + 错峰
4. Conveyor 加容量警戒丝带（黄/红切换 + 闪烁）
5. OutputPort.notifyColumnChanged 加颜色脉冲
6. Conveyor 加 12 个滚动标记
7. sfx.js 加 playBoxClear / playMarbleDrop / playWarning
8. MenuScene 装饰元素改为循环传送带

最后做 itch.io 部署：
- 打包 zip
- 准备项目页面文案（用本文档"itch.io 描述更新"段落）
- 录一个 90 秒 demo 视频

== 硬约束 ==
- 不要引入新的资源文件（粒子用代码生成 texture）
- 不要让滚动标记影响弹珠的位置计算（它们是独立的视觉对象）
- 容量警戒丝带的 tween 必须 stop 后才能重新开始（防止内存泄漏）
- 所有 tween 都要在 onComplete / 销毁场景时被清理
- Conveyor 的滚动标记数组在 destroy 时也要清理

== 自验 ==
- Performance 录制 30 秒，FPS 不掉
- 故意触发警戒：连点方块直到传送带 21 颗 → 边框红色闪烁 + warning 音效
- 触发箱子装满：粒子 + 闪光 + 震动 + sfx 都生效
- 整列上移：弹簧感明显，从顶到底依次启动
- 主菜单：背景传送带匀速转动

== 交付 ==
1. 所有更新的源文件
2. Performance 测试结果
3. zip 包 marble-sort.zip
4. itch.io 项目页面文案（已写好可粘贴）
5. README.md 更新
6. demo 视频链接（YouTube unlisted 或 Loom）
```
