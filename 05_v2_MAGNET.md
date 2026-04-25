# Task 05_v2 — 磁铁 Booster（传送带版）

> **优先级**：P1（创新分）
> **预计工时**：1.5-2 小时
> **依赖**：02c 已完成
> **执行前必读**：`00_MASTER_SPEC.md`, `02c_CONVEYOR_BOX.md`
>
> **本任务是对原 05_MAGNET.md 的更新**。原 spec 大部分仍有效（按钮 UI、色环菜单、屏幕震动），只改"执行磁铁"那段逻辑——从操作 Queue.marbles 改为调用 `conveyor.magnetize(color)`。

## 改动范围

**保留不动**：
- 磁铁按钮 UI（顶部 HUD 左侧的 64×64 圆角按钮）
- 数量徽章
- 色环菜单（出现在屏幕中下部）
- 点击外部取消机制
- 屏幕震动 + 蓝色闪光反馈
- count 数量管理（从 level JSON 读 magnet_count）

**改动**：
- `_executeMagnetize` 不再操作 `queue.marbles` 和 `tray.addMarble`，改为调用 `conveyor.magnetize(color)`，传送带类内部已实现完整的同步移除 + 异步飞行
- 色环菜单的"队列里存在的颜色"判断，改为"传送带上存在的颜色 + 至少有一个对应顶层箱接受这个色"

## 详细规格

### 1. Magnet 类改动（src/boosters/Magnet.js）

```javascript
import { COLORS } from '../config/colors.js';

export class Magnet {
  constructor(scene, count) {
    this.scene = scene;
    this.count = count;
    this.isActive = false;
    this.button = null;
    this.colorMenu = null;
    this.render();
  }
  
  // render() 不变（保留旧版）
  render() { /* 同 05_MAGNET.md 旧版 */ }
  _refreshState() { /* 同旧版 */ }
  
  activate() {
    if (this.count <= 0 || this.isActive) return;
    
    // ⚠ 改动：从 conveyor 取颜色
    const conveyor = this.scene.conveyor;
    const presentColors = [...new Set(
      conveyor.marbles
        .filter(m => m.state === 'on-conveyor')
        .map(m => m.color)
    )];
    
    if (presentColors.length === 0) {
      this.scene._showToast('Conveyor is empty!');
      return;
    }
    
    // 进一步过滤：只显示"至少有某列顶层箱能接受"的颜色
    const acceptableColors = presentColors.filter(color =>
      this.scene.boxColumns.some(bc => bc.canAcceptColor(color))
    );
    
    if (acceptableColors.length === 0) {
      this.scene._showToast('No matching boxes available!');
      return;
    }
    
    this.isActive = true;
    this._showColorMenu(acceptableColors);
  }
  
  _showColorMenu(colors) {
    // ⚠ 与旧版相同的色环视觉
    const cx = 360;
    const cy = 700;
    
    this.colorMenu = this.scene.add.container(cx, cy);
    
    const dim = this.scene.add.rectangle(360 - cx, 640 - cy, 720, 1280, 0x000000, 0.5);
    dim.setInteractive();
    dim.on('pointerdown', () => this._cancel());
    this.colorMenu.add(dim);
    
    const hint = this.scene.add.text(0, -120, 'Pick a color to magnetize', {
      fontSize: 28, color: '#fff', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.colorMenu.add(hint);
    
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
    // ⚠ 完全简化：所有同步/异步逻辑都在 Conveyor.magnetize 内部
    const count = this.scene.conveyor.magnetize(color);
    
    if (count === 0) {
      this.scene._showToast('No marbles of that color on conveyor');
      this._closeColorMenu();
      return;
    }
    
    // 反馈
    this.scene.cameras.main.shake(150, 0.005);
    this.scene.cameras.main.flash(120, 100, 200, 255);
    
    this.count--;
    this._refreshState();
    this._closeColorMenu();
    
    // 触发胜利检查
    this.scene.time.delayedCall(count * 80 + 500, () => {
      this.scene._checkVictory();
    });
  }
  
  _cancel() { this._closeColorMenu(); }
  
  _closeColorMenu() {
    this.isActive = false;
    if (this.colorMenu) {
      this.colorMenu.destroy();
      this.colorMenu = null;
    }
  }
}
```

### 2. Conveyor.magnetize 方法（02c 已实现，复习一下）

02c 里已经写好的：

```javascript
// Conveyor.js 中的 magnetize 方法
magnetize(color) {
  const matched = this.marbles.filter(
    m => m.color === color && m.state === 'on-conveyor'
  );
  
  matched.forEach((marble, i) => {
    const port = this.outputPorts.find(
      p => p.boxColumn.canAcceptColor(color)
    );
    
    // 同步移除
    const idx = this.marbles.indexOf(marble);
    if (idx !== -1) this.marbles.splice(idx, 1);
    
    this.scene.time.delayedCall(i * 80, () => {
      if (port) {
        marble.state = 'flying-to-magnet-target';
        const target = port.boxColumn.reserveSlotForColor(color);
        if (target) {
          marble.flyTo(target.x, target.y, 400, 'Cubic.easeOut', () => {
            port.boxColumn.fillVisualSlot(marble);
            marble.destroy();
          });
          return;
        }
      }
      // 没箱子接 → 飞出屏幕
      marble.state = 'overflow-exit';
      marble.flyTo(360, -100, 400, 'Cubic.easeOut', () => {
        marble.destroy();
      });
    });
  });
  
  return matched.length;
}
```

**关键设计**：磁铁触发时如果有多颗弹珠匹配，但顶层箱只剩 1 槽位，那么：
- 第一颗：reserveSlotForColor 返回坐标，飞向箱子
- 第二颗：原顶层箱已 reserve 满（current_count == capacity），但 fillVisualSlot 还没触发 onFull → canAcceptColor 已经返回 false → port 找不到匹配 → 飞出屏幕

这个边界**可能不太理想**——玩家用磁铁后部分弹珠"白用"了。优化方案：

```javascript
// 改进版 magnetize：每颗弹珠重新查询可接收的列
magnetize(color) {
  const matched = this.marbles.filter(
    m => m.color === color && m.state === 'on-conveyor'
  );
  
  // 同步：先全部从 conveyor 移除
  matched.forEach(marble => {
    const idx = this.marbles.indexOf(marble);
    if (idx !== -1) this.marbles.splice(idx, 1);
  });
  
  // 异步：错峰飞行，每颗都重新找一次可接收的列
  matched.forEach((marble, i) => {
    this.scene.time.delayedCall(i * 80, () => {
      // 重新扫描所有列，找有空位的
      const port = this.outputPorts.find(
        p => p.boxColumn.canAcceptColor(color)
      );
      
      if (port) {
        marble.state = 'flying-to-magnet-target';
        const target = port.boxColumn.reserveSlotForColor(color);
        if (target) {
          marble.flyTo(target.x, target.y, 400, 'Cubic.easeOut', () => {
            port.boxColumn.fillVisualSlot(marble);
            marble.destroy();
          });
          return;
        }
      }
      marble.state = 'overflow-exit';
      marble.flyTo(360, -100, 400, 'Cubic.easeOut', () => {
        marble.destroy();
      });
    });
  });
  
  return matched.length;
}
```

**为什么这样更好**：因为 `delayedCall` 是错峰的（每颗间隔 80ms），第一颗的 `fillVisualSlot` 已经会触发 box-full 事件，导致顶箱消失、新顶箱出现。第二颗到达时如果运气好，新顶箱也是同色 → 还能接收。

**这个改进版本应该写进 02c 而不是这里**——所以本任务的 Codex Prompt 里要明确：**先去更新 Conveyor.js 的 magnetize 方法为这个改进版**。

### 3. 关卡数据复习

03_v2 已经设置了：
- Level 1: magnet_count = 0（按钮灰色）
- Level 2: magnet_count = 1
- Level 3: magnet_count = 2

不需要改。

## 验收标准

- [ ] GameScene 顶部出现磁铁按钮，显示数量
- [ ] Level 1 磁铁按钮灰色禁用
- [ ] Level 2 启动时磁铁数量 1
- [ ] Level 3 启动时磁铁数量 2
- [ ] 传送带空时点磁铁，toast 提示 "Conveyor is empty"
- [ ] 传送带有 pink 弹珠但所有列顶层都不是 pink → toast 提示 "No matching boxes available"
- [ ] 传送带有 pink 弹珠且至少一列顶层是 pink → 色环菜单出现
- [ ] 选 pink → 所有 pink 弹珠平滑飞向匹配的列顶层箱
- [ ] 屏幕震动 + 蓝色闪光
- [ ] 磁铁数量 -1
- [ ] 点色环外取消，磁铁不消耗
- [ ] **改进版测试**：手动构造场景——传送带 9 颗 pink，col0 顶层 pink 容量 1（已装 2/3），其余列顶层非 pink。触发磁铁 pink → 第 1 颗装满 col0 顶箱 → 顶箱消失 → 新顶箱可能仍是 pink → 第 2-9 颗继续装入新顶箱（链式）

## Agent Prompt（直接复制给 Codex）

```
你已经完成了 02c + 03_v2 + 04_v2 + Pointer Hit Zone bugfix。现在执行 05_v2_MAGNET.md。

执行前请按顺序读：
1. specs/00_MASTER_SPEC.md
2. specs/02c_CONVEYOR_BOX.md（核心）
3. specs/05_MAGNET.md（旧版，UI 部分仍然有效）
4. specs/05_v2_MAGNET.md（本任务）

== 任务 ==
1. 更新 src/entities/Conveyor.js 的 magnetize 方法为本文档"改进版"——所有匹配弹珠先同步从 marbles 数组移除，再各自 delayedCall 错峰飞行，每颗到达时重新查询可接收的列（应对链式消除）
2. 创建或更新 src/boosters/Magnet.js：
   - render() / _refreshState() / 色环菜单 UI / 取消逻辑：保留旧版 05_MAGNET.md 描述
   - activate() 改为从 this.scene.conveyor.marbles 取颜色，过滤掉"无匹配箱"的颜色
   - _executeMagnetize() 改为单纯调用 this.scene.conveyor.magnetize(color)，加震动闪光反馈，并触发胜利检查
3. GameScene.create() 中实例化 Magnet：const m = new Magnet(this, levelData.magnet_count || 0)

== 硬约束 ==
- 不要改 Conveyor 类的对外 API（acceptMarble / update / setPaused / count），只改 magnetize 方法体
- Magnet 按钮的 hitZone 模式保留（与 04 + bugfix 一致）
- 不能在 magnetize 里同步飞行所有弹珠（必须 delayedCall 错峰），否则视觉上 9 颗弹珠瞬移很违和
- 不要写出"先 reserve 全部槽位再启动飞行"的逻辑——必须每颗到达时重新查询，才能利用链式消除

== 自验 ==
1. Level 2 关卡：故意点错颜色让传送带堆积 → 用磁铁清理 → 通关
2. 构造测试场景验证链式消除：手工编辑器创建一关 col0 顶 pink、第二层 pink、第三层 blue；点 1 个 pink 方块（9 颗弹珠）；磁铁触发 pink → 应该 6 颗装满前两个 pink 箱（连续消失），剩 3 颗装到 col0 第三层（如果第三层是 pink）或飞出屏幕（如果不是）

== 交付 ==
1. 更新后的 Conveyor.js（magnetize 改进版）
2. 更新后的 Magnet.js
3. 更新后的 GameScene.js（仅磁铁实例化部分）
4. 自验测试报告：Level 2 通关流程描述 + 链式消除测试结果
```
