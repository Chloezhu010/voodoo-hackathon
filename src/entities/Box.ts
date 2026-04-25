import { getColorDefinition } from '../config/colors.js';
import { CONFIG } from '../config/constants.js';
import type { ColorId } from '../sim/types.js';

import type { Marble } from './Marble.js';

interface SlotMarker {
  x: number;
  y: number;
}

export interface ReservedBoxSlot {
  box: Box;
  slotIndex: number;
  x: number;
  y: number;
}

export class Box {
  readonly scene: Phaser.Scene;
  readonly color: ColorId;
  readonly capacity: number;
  current_count = 0;
  visual_filled = 0;
  reservedSlots: number[] = [];
  readonly container: Phaser.GameObjects.Container;
  slotMarkers: SlotMarker[] = [];
  onVisualFull: (() => void) | null = null;

  constructor(scene: Phaser.Scene, color: ColorId, capacity = CONFIG.BOX_COLUMNS.BOX_CAPACITY) {
    this.scene = scene;
    this.color = color;
    this.capacity = capacity;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(90);
    this._render();
  }

  private _render(): void {
    const { BOX_WIDTH: width, BOX_HEIGHT: height, SLOT_RADIUS: radius } = CONFIG.BOX_COLUMNS;
    const color = getColorDefinition(this.color);

    const bg = this.scene.add.graphics();
    bg.fillStyle(color.hex, 0.86);
    bg.fillRoundedRect(-width / 2, -height / 2, width, height, 8);
    bg.lineStyle(2, 0x000000, 0.28);
    bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 8);
    this.container.add(bg);

    for (let i = 0; i < this.capacity; i += 1) {
      const x = -width / 2 + (i + 1) * (width / (this.capacity + 1));
      const marker = this.scene.add.graphics();
      marker.fillStyle(0x000000, 0.12);
      marker.fillCircle(x, 0, radius + 1);
      marker.lineStyle(2, 0xffffff, 0.42);
      marker.strokeCircle(x, 0, radius);
      this.container.add(marker);
      this.slotMarkers.push({ x, y: 0 });
    }
  }

  canAccept(color: ColorId): boolean {
    return this.color === color && this.current_count < this.capacity;
  }

  reserveSlot(): ReservedBoxSlot | null {
    if (this.current_count >= this.capacity) return null;
    const slotIdx = this.current_count;
    const marker = this.slotMarkers[slotIdx]!;
    this.current_count += 1;
    this.reservedSlots.push(slotIdx);
    return {
      box: this,
      slotIndex: slotIdx,
      x: this.container.x + marker.x,
      y: this.container.y + marker.y,
    };
  }

  isReservedFull(): boolean {
    return this.current_count >= this.capacity;
  }

  fillVisualSlot(marble: Marble | null | undefined): void {
    if (this.visual_filled >= this.capacity) return;
    const slotIdx = this.reservedSlots.length > 0
      ? this.reservedSlots.shift()!
      : this.visual_filled;
    const marker = this.slotMarkers[slotIdx]!;
    const color = getColorDefinition(marble?.color ?? this.color);

    const filled = this.scene.add.graphics();
    filled.fillStyle(color.hex, 1);
    filled.fillCircle(marker.x, marker.y, CONFIG.BOX_COLUMNS.SLOT_RADIUS);
    filled.fillStyle(0xffffff, 0.38);
    filled.fillCircle(marker.x - 4, marker.y - 4, 4);
    this.container.add(filled);

    this.visual_filled += 1;
    this.scene.tweens.add({
      targets: this.container,
      scale: { from: 1.08, to: 1 },
      duration: 150,
      ease: 'Back.easeOut',
    });

    if (this.visual_filled >= this.capacity) {
      const onVisualFull = this.onVisualFull;
      this.onVisualFull = null;
      this.destroyWithAnimation(onVisualFull);
    }
  }

  destroyWithAnimation(onComplete: (() => void) | null = null): void {
    this.scene.tweens.add({
      targets: this.container,
      scale: 1.35,
      alpha: 0,
      duration: 250,
      ease: 'Back.easeIn',
      onComplete: () => {
        this.container.destroy(true);
        if (onComplete) onComplete();
      },
    });
  }

  setPosition(x: number, y: number): void {
    this.container.x = x;
    this.container.y = y;
  }

  tweenPosition(x: number, y: number, duration = 300): void {
    this.scene.tweens.add({
      targets: this.container,
      x,
      y,
      duration,
      ease: 'Cubic.easeOut',
    });
  }
}
