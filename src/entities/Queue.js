import { CONFIG, UI } from '../config/constants.js';

export default class Queue {
  constructor(scene, capacity, trays) {
    this.scene = scene;
    this.capacity = capacity || CONFIG.QUEUE_CAPACITY_DEFAULT;
    this.trays = trays;
    this.marbles = [];
    this._overflowFired = false;
    this.slotPositions = this._computeSlotPositions();
    this.container = scene.add.container(0, 0);
    this.container.setDepth(40);
    this._renderTrack();
  }

  _computeSlotPositions() {
    const positions = [];
    const startX = CONFIG.QUEUE_AREA.x + 30;
    const stepX = this.capacity > 1
      ? (CONFIG.QUEUE_AREA.width - 60) / (this.capacity - 1)
      : 0;
    const y = CONFIG.QUEUE_AREA.y + CONFIG.QUEUE_AREA.height / 2;

    for (let i = 0; i < this.capacity; i += 1) {
      positions.push({ x: startX + i * stepX, y });
    }

    return positions;
  }

  _renderTrack() {
    const g = this.scene.add.graphics();
    const area = CONFIG.QUEUE_AREA;
    g.fillStyle(UI.PANEL_DARK, 1);
    g.fillRoundedRect(area.x, area.y, area.width, area.height, 28);
    g.lineStyle(3, 0xffffff, 0.1);
    g.strokeRoundedRect(area.x, area.y, area.width, area.height, 28);

    this.slotPositions.forEach((slot) => {
      g.fillStyle(0xffffff, 0.07);
      g.fillCircle(slot.x, slot.y, CONFIG.MARBLE_RADIUS + 2);
    });

    this.container.add(g);
  }

  enqueue(marble) {
    if (this.scene.isEnding) {
      marble.state = 'exiting';
      marble.destroy();
      return;
    }

    if (this.marbles.length >= this.capacity) {
      this._handleOverflow(marble);
      return;
    }

    const slotIdx = this.marbles.length;
    this.marbles.push(marble);
    marble.state = 'queued';
    marble.slotIndex = slotIdx;

    const target = this.slotPositions[slotIdx];
    marble.flyTo(target.x, target.y, 250, 'Quad.easeOut', () => {
      this.evaluateMatching();
    });
  }

  _handleOverflow(marble) {
    marble.state = 'exiting';
    marble.slotIndex = -1;

    if (marble.sprite) {
      this.scene.tweens.add({
        targets: marble.sprite,
        x: marble.sprite.x + Phaser.Math.Between(-5, 5),
        duration: 50,
        repeat: 4,
        yoyo: true,
        onComplete: () => marble.destroy()
      });
    } else {
      marble.destroy();
    }

    if (!this._overflowFired) {
      this._overflowFired = true;
      this.scene.events.emit('queue-overflow');
    }
  }

  evaluateMatching() {
    // 同步阶段先决定并提交数据变化：队列立即 splice，Tray 立即 current_count + reserve；
    // 异步阶段只负责 Tween 追赶视觉，避免快速点击、磁铁、Tray 完成瞬间造成数组和槽位竞态。
    if (this.scene.isEnding) return;

    const consumed = [];
    const trayFutureCount = new Map();
    this.trays.forEach((tray) => trayFutureCount.set(tray, tray.current_count));

    for (const marble of this.marbles) {
      if (marble.state !== 'queued') continue;

      const tray = this.trays.find((candidate) => (
        candidate.color === marble.color && trayFutureCount.get(candidate) < candidate.capacity
      ));

      if (tray) {
        consumed.push({ marble, tray });
        trayFutureCount.set(tray, trayFutureCount.get(tray) + 1);
      }
    }

    if (consumed.length === 0) return;

    const consumedSet = new Set(consumed.map(({ marble }) => marble));
    this.marbles = this.marbles.filter((marble) => !consumedSet.has(marble));

    const assignments = consumed.map(({ marble, tray }) => {
      marble.state = 'flying-to-tray';
      marble.slotIndex = -1;
      const slot = tray.reserveAndGetNextSlotPosition();
      return { marble, tray, slot };
    });

    this._reindexMarbles();
    this._animateQueuedMarblesToSlots();

    assignments.forEach(({ marble, tray, slot }, index) => {
      this.scene.time.delayedCall(index * 60, () => {
        if (this.scene.isEnding || marble.state === 'destroyed') return;
        marble.flyTo(slot.x, slot.y, 350, 'Cubic.easeOut', () => {
          tray.fillVisualSlot(marble);
          marble.destroy();
        });
      });
    });
  }

  removeMarble(marble) {
    const idx = this.marbles.indexOf(marble);
    if (idx === -1) return;

    this.marbles.splice(idx, 1);
    marble.slotIndex = -1;
    this._reindexMarbles();
    this._animateQueuedMarblesToSlots();
  }

  _reindexMarbles() {
    this.marbles.forEach((marble, index) => {
      marble.slotIndex = index;
    });
  }

  _animateQueuedMarblesToSlots() {
    this.marbles.forEach((marble, index) => {
      if (marble.state !== 'queued' || !marble.sprite) return;
      const target = this.slotPositions[index];
      if (!target) return;
      if (Math.abs(marble.sprite.x - target.x) > 1 || Math.abs(marble.sprite.y - target.y) > 1) {
        marble.flyTo(target.x, target.y, 150, 'Sine.easeOut');
      }
    });
  }
}
