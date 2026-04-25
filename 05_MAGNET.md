# Task 05 — 磁铁 Booster（创新点 1）

> **优先级**：P1（创新分，P0 全部完成后立刻做这个）
> **预计工时**：2-3 小时
> **依赖**：Task 02 + **02b（必须先完成 02b 才能做 05，否则 magnet 会破坏队列状态）**
> **执行前必读**：`00_MASTER_SPEC.md`, `02b_QUEUE_TRAY_LOGIC.md`

## 任务目标

实现磁铁 Booster——这是 Track 1 评分中 **Creativity** 维度的核心拉分点。reference 游戏里磁铁只有简单的"吸取"功能，我们做一个**深度版**：让玩家选择一个颜色，把队列中所有该色弹珠**强制送入对应 Tray**（即使 Tray 已满则消失）。

## 为什么这个机制能加分

- **解决核心痛点**：玩家最大的挫败感来自队列里卡了无效色弹珠。磁铁直接消除这种死局
- **不破坏 puzzle 性**：磁铁数量有限（Level 1: 0, Level 2: 1, Level 3: 2），仍需策略
- **视觉爽点**：磁铁吸附 + 弹珠飞行的动画反馈极强，是 Voodoo 评委爱看的"juicy" 反馈

## 详细规格

### 1. 文件清单

```
src/boosters/Magnet.js              # 磁铁逻辑
src/scenes/GameScene.js             # 集成 Booster Bar
```

### 2. UI 集成位置

在 GameScene 顶部 HUD 左侧（Y=40 区域），加一个磁铁按钮：

```
┌────────────────────────────────────────────┐
│ [🧲 ×2]   LEVEL 03   [🪙 1200]    [⚙]      │  顶部 HUD
└────────────────────────────────────────────┘
```

- 磁铁按钮：64×64，圆角，深色背景
- 中央显示磁铁图标（用 Phaser Graphics 画一个 U 型磁铁，或者用 emoji 🧲）
- 右下角小红圆显示剩余数量
- 数量为 0 时按钮变灰，不可点击

### 3. 磁铁交互流程

```
玩家点击磁铁按钮
   ↓
进入"选色模式"：底部弹出色环菜单（仅显示队列中存在的颜色）
   ↓
玩家点击某色 → 关闭色环
   ↓
触发磁铁动画：所有该色弹珠从队列吸出，飞向对应 Tray
   ↓
如果 Tray 满，多余弹珠飞向画面外消失
   ↓
磁铁数量 -1，恢复正常游戏状态
```

**取消机制**：在选色模式下点击非色环区域取消，磁铁不消耗。

### 4. Magnet 类（src/boosters/Magnet.js）

```javascript
import { COLORS } from '../config/colors.js';

export class Magnet {
  constructor(scene, count) {
    this.scene = scene;
    this.count = count;
    this.isActive = false;       // 是否处于选色模式
    this.button = null;
    this.colorMenu = null;
    this.render();
  }
  
  render() {
    const x = 80;
    const y = 40;
    
    // 背景圆角矩形
    this.button = this.scene.add.container(x, y);
    const bg = this.scene.add.graphics();
    bg.fillStyle(0x2d2d44, 1);
    bg.fillRoundedRect(-32, -32, 64, 64, 16);
    bg.lineStyle(2, 0xff6b9d, 1);
    bg.strokeRoundedRect(-32, -32, 64, 64, 16);
    this.button.add(bg);
    
    // 磁铁图标（emoji 法最快）
    const icon = this.scene.add.text(0, 0, '🧲', { fontSize: 36 }).setOrigin(0.5);
    this.button.add(icon);
    
    // 数量徽章
    this.badge = this.scene.add.container(20, -20);
    const badgeBg = this.scene.add.circle(0, 0, 14, 0xff3355);
    this.badge.add(badgeBg);
    this.badgeText = this.scene.add.text(0, 0, this.count, {
      fontSize: 18, color: '#fff', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.badge.add(this.badgeText);
    this.button.add(this.badge);
    
    // 交互
    bg.setInteractive(new Phaser.Geom.Rectangle(-32, -32, 64, 64), 
                      Phaser.Geom.Rectangle.Contains);
    bg.on('pointerdown', () => this.activate());
    
    this._refreshState();
  }
  
  _refreshState() {
    if (this.count <= 0) {
      this.button.setAlpha(0.4);
      this.badge.setVisible(false);
    } else {
      this.button.setAlpha(1);
      this.badge.setVisible(true);
      this.badgeText.setText(this.count);
    }
  }
  
  activate() {
    if (this.count <= 0 || this.isActive) return;
    
    // 收集队列中存在的颜色
    const queue = this.scene.queue;
    const presentColors = [...new Set(queue.marbles.map(m => m.color))];
    
    if (presentColors.length === 0) {
      this.scene._showToast('Queue is empty!');
      return;
    }
    
    this.isActive = true;
    this._showColorMenu(presentColors);
  }
  
  _showColorMenu(colors) {
    // 在屏幕中下部弹出色环
    const cx = 360;
    const cy = 700;
    
    this.colorMenu = this.scene.add.container(cx, cy);
    
    // 背景蒙版（点击空白取消）
    const dim = this.scene.add.rectangle(360 - cx, 640 - cy, 720, 1280, 0x000000, 0.5);
    dim.setInteractive();
    dim.on('pointerdown', () => this._cancel());
    this.colorMenu.add(dim);
    
    // 提示文字
    const hint = this.scene.add.text(0, -120, 'Pick a color to magnetize', {
      fontSize: 28, color: '#fff', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.colorMenu.add(hint);
    
    // 颜色按钮（最多 6 色，水平排列）
    const startX = -((colors.length - 1) * 80) / 2;
    colors.forEach((color, i) => {
      const btn = this.scene.add.container(startX + i * 80, 0);
      const circle = this.scene.add.graphics();
      circle.fillStyle(COLORS[color].hex, 1);
      circle.fillCircle(0, 0, 32);
      circle.lineStyle(4, 0xffffff, 1);
      circle.strokeCircle(0, 0, 32);
      btn.add(circle);
      
      circle.setInteractive(new Phaser.Geom.Circle(0, 0, 32), 
                            Phaser.Geom.Circle.Contains);
      circle.on('pointerover', () => btn.setScale(1.15));
      circle.on('pointerout', () => btn.setScale(1));
      circle.on('pointerdown', (pointer, lx, ly, evt) => {
        evt.stopPropagation();
        this._executeMagnetize(color);
      });
      
      this.colorMenu.add(btn);
    });
  }
  
  _executeMagnetize(color) {
    const queue = this.scene.queue;
    const trays = this.scene.trays;
    const targetTray = trays.find(t => t.color === color && !t.isFull());
    
    // ⚠ 与 02b 保持一致：先同步从队列移除（数据层），再启动飞行动画（视觉层）
    // 这样磁铁触发的瞬间 queue.marbles 就反映了正确状态
    
    // 找出队列中所有该色弹珠
    const matched = queue.marbles.filter(m => m.color === color);
    
    // 同步阶段：先从数据层全部移除，并 reserve tray 槽位
    const flightPlan = matched.map(marble => {
      let targetX, targetY;
      let willFillTray = false;
      
      if (targetTray && targetTray.current_count < targetTray.capacity) {
        const slot = targetTray.reserveAndGetNextSlotPosition();
        targetTray.current_count += 1;
        targetX = slot.x;
        targetY = slot.y;
        willFillTray = true;
        marble.state = 'flying-to-tray';
      } else {
        targetX = 360;
        targetY = -100;
        marble.state = 'exiting';
      }
      
      // 从队列同步移除
      queue.removeMarble(marble);
      
      return { marble, targetX, targetY, willFillTray };
    });
    
    // 异步阶段：错峰播放飞行动画
    flightPlan.forEach(({ marble, targetX, targetY, willFillTray }, i) => {
      this.scene.time.delayedCall(i * 80, () => {
        marble.flyTo(targetX, targetY, 350, 'Cubic.easeOut', () => {
          if (willFillTray) {
            targetTray.fillVisualSlot(marble);
          }
          marble.destroy();
        });
      });
    });
    
    this.count--;
    this._refreshState();
    this._closeColorMenu();
    
    // 触发胜利检查（可能磁铁直接通关了）
    this.scene.time.delayedCall(matched.length * 80 + 500, () => {
      this.scene._checkVictory();
    });
  }
  
  _cancel() {
    this._closeColorMenu();
  }
  
  _closeColorMenu() {
    this.isActive = false;
    if (this.colorMenu) {
      this.colorMenu.destroy();
      this.colorMenu = null;
    }
  }
}
```

### 5. GameScene 集成

```javascript
// GameScene.js create()
import { Magnet } from '../boosters/Magnet.js';

create() {
  // ... 现有代码
  
  // 创建磁铁
  this.magnet = new Magnet(this, levelData.magnet_count || 0);
}
```

### 6. 视觉特效要求

磁铁触发瞬间，加一个**短促的吸附特效**：
- 屏幕上从被吸取弹珠位置，画一条快速的光线 trail（用 Tween + Graphics 画半透明白线）
- 持续 200ms 自动消失
- 配合一个轻微的屏幕震动（`this.cameras.main.shake(150, 0.005)`）

### 7. 关卡数据补充

Level 数据已经在 Task 03 里设好了 `magnet_count`：
- Level 1: 0
- Level 2: 1
- Level 3: 2

Editor 也已经支持 magnet_count 参数。

## 平衡性自验

启用磁铁后，重新测试 3 关：
- Level 2：原本可能输的关现在用磁铁能稳过
- Level 3：必须用至少 1 个磁铁才能通关，但 2 个磁铁不能让玩家无脑通关

## 验收标准

- [ ] GameScene 顶部出现磁铁按钮，显示数量
- [ ] Level 1 磁铁数量为 0，按钮灰色
- [ ] Level 2 磁铁 1 个，Level 3 磁铁 2 个
- [ ] 队列里有弹珠时点磁铁，弹出色环菜单
- [ ] 队列为空时点磁铁，显示 toast 提示
- [ ] 选色后队列里所有该色弹珠被吸走（飞向 tray 或屏幕外）
- [ ] 磁铁数量 -1
- [ ] 点击色环外区域可取消，不消耗磁铁
- [ ] 触发磁铁时有屏幕震动反馈
- [ ] 磁铁消除后正确触发胜利检查（可能通关）

## Agent Prompt（直接复制给 Codex）

```
You are implementing the Magnet Booster for "Marble Sort!" per 05_MAGNET.md.

Read 00_MASTER_SPEC.md, 02_CORE_GAMEPLAY.md first. Core gameplay and 3 levels exist.

This is the primary Creativity feature for Voodoo's evaluation. Quality of feel matters more than feature count.

Strict rules:
- Place Magnet code in src/boosters/Magnet.js
- Reuse existing Queue and Tray APIs — don't reach into their internals beyond what's documented
- The color picker menu must dim the background and be cancellable by clicking outside
- Use camera.shake for the activation feedback
- Use emoji 🧲 for the icon (no asset needed)

Tasks:
1. Create src/boosters/Magnet.js with the full Magnet class
2. Wire it into GameScene.create() (read magnet_count from level data)
3. Test: open Level 2, click magnet, pick blue color → all blue marbles in queue should fly to blue tray
4. Test: open Level 1, magnet button must be greyed out
5. Test: click magnet with empty queue → toast appears, no count consumed
6. Test: click magnet, click outside color menu → menu closes, no count consumed

Deliver:
1. Magnet.js
2. Updated GameScene.js
3. Manual playtest log: try Level 2 and Level 3 with magnets, confirm they're usable but don't trivialize the puzzle
```
