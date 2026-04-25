import { CONFIG, UI } from '../config/constants.js';
import { getColorDefinition } from '../config/colors.js';

export default class Tray {
  constructor(scene, x, y, color, capacity = CONFIG.TRAY_CAPACITY) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.color = color;
    this.capacity = capacity;
    this.current_count = 0;
    this.visual_filled = 0;
    this.reserved_slots = [];
    this.isCompleted = false;
    this.marbles = [];
    this.container = scene.add.container(x, y);
    this.container.setDepth(60);
    this.render(false);
  }

  get filled() {
    return this.current_count;
  }

  render(isComplete) {
    this.container.removeAll(true);

    const colorDef = getColorDefinition(this.color);
    const g = this.scene.add.graphics();
    const baseColor = isComplete ? UI.GOLD : colorDef.hex;
    g.fillStyle(baseColor, isComplete ? 0.9 : 0.24);
    g.fillRoundedRect(-44, -54, 88, 108, 14);
    g.lineStyle(3, isComplete ? 0xffffff : colorDef.hex, isComplete ? 0.85 : 0.8);
    g.strokeRoundedRect(-44, -54, 88, 108, 14);

    for (let i = 0; i < this.capacity; i += 1) {
      const pos = this._getRelativeSlotPosition(i);
      g.fillStyle(0x000000, 0.18);
      g.fillCircle(pos.x, pos.y, CONFIG.MARBLE_RADIUS + 2);
      g.lineStyle(2, 0xffffff, 0.18);
      g.strokeCircle(pos.x, pos.y, CONFIG.MARBLE_RADIUS + 2);
    }

    this.container.add(g);
    this.slotLayer = this.scene.add.container(0, 0);
    this.container.add(this.slotLayer);

    for (let i = 0; i < this.visual_filled; i += 1) {
      this._renderFilledSlot(i, this.color);
    }

    const label = this.scene.add.text(0, 70, this.color.toUpperCase(), {
      fontSize: '14px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.container.add(label);
  }

  _getRelativeSlotPosition(index) {
    const cols = 3;
    const col = index % cols;
    const row = Math.floor(index / cols);
    return {
      x: -26 + col * 26,
      y: -16 + row * 32
    };
  }

  _slotIndexToWorldPos(slotIdx) {
    const relative = this._getRelativeSlotPosition(slotIdx);
    return {
      x: this.x + relative.x,
      y: this.y + relative.y
    };
  }

  getNextSlotPosition() {
    const slotIdx = Math.min(this.visual_filled + this.reserved_slots.length, this.capacity - 1);
    return this._slotIndexToWorldPos(slotIdx);
  }

  reserveAndGetNextSlotPosition() {
    if (this.isFull()) {
      return this._slotIndexToWorldPos(this.capacity - 1);
    }

    const slotIdx = this.visual_filled + this.reserved_slots.length;
    this.reserved_slots.push(slotIdx);
    this.current_count += 1;
    return this._slotIndexToWorldPos(slotIdx);
  }

  fillVisualSlot(marble) {
    if (this.visual_filled >= this.capacity || this.isCompleted) {
      return;
    }

    const slotIdx = this.reserved_slots.length > 0
      ? this.reserved_slots.shift()
      : this.visual_filled;
    this.visual_filled += 1;
    this.marbles.push(marble);
    this._renderFilledSlot(slotIdx, marble.color);
    this._playFillFeedback();

    if (this.visual_filled >= this.capacity && !this.isCompleted) {
      this._onComplete();
    }
  }

  addMarble(marble) {
    if (!this.isFull()) {
      this.reserveAndGetNextSlotPosition();
    }
    this.fillVisualSlot(marble);
  }

  _renderFilledSlot(slotIdx, color) {
    if (!this.slotLayer) return;
    const pos = this._getRelativeSlotPosition(slotIdx);
    const dot = this.scene.add.graphics();
    dot.fillStyle(getColorDefinition(color).hex, 1);
    dot.fillCircle(pos.x, pos.y, CONFIG.MARBLE_RADIUS);
    dot.fillStyle(0xffffff, 0.4);
    dot.fillCircle(pos.x - 5, pos.y - 5, 5);
    dot.lineStyle(2, 0x000000, 0.12);
    dot.strokeCircle(pos.x, pos.y, CONFIG.MARBLE_RADIUS);
    this.slotLayer.add(dot);
  }

  _playFillFeedback() {
    this.scene.tweens.add({
      targets: this.container,
      scale: { from: 1.05, to: 1 },
      duration: 150,
      ease: 'Back.easeOut'
    });
  }

  _onComplete() {
    this.isCompleted = true;
    this.render(true);
    this.scene.tweens.add({
      targets: this.container,
      scale: { from: 1.18, to: 1 },
      duration: 260,
      ease: 'Back.easeOut'
    });
    this.scene.events.emit('tray-completed', this);
  }

  isFull() {
    return this.current_count >= this.capacity;
  }
}
