import { boxArtKey, hasArtTexture, marbleArtKey } from '../assets/artAssets.js';
import { getColorDefinition } from '../config/colors.js';
import { CONFIG } from '../config/constants.js';
import { canAcceptBoxSlot, reserveBoxSlotIndex } from '../sim/boxColumnRules.js';
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

    const boxKey = boxArtKey(this.color, 'empty');
    if (hasArtTexture(this.scene, boxKey)) {
      this.container.add(this.scene.add.image(0, 0, boxKey).setDisplaySize(width, height));
    } else {
      const bg = this.scene.add.graphics();
      bg.fillStyle(0x2d477a, 0.2);
      bg.fillRoundedRect(-width / 2 + 5, -height / 2 + 7, width, height, 10);
      bg.fillStyle(0x000000, 0.14);
      bg.fillRoundedRect(-width / 2, -height / 2 + 8, width, height, 8);
      bg.fillStyle(color.hex, 1);
      bg.fillRoundedRect(-width / 2, -height / 2, width, height, 8);
      bg.fillStyle(0xffffff, 0.22);
      bg.fillRoundedRect(-width / 2 + 6, -height / 2 + 5, width - 12, 13, 7);
      bg.fillStyle(0x000000, 0.12);
      bg.fillRoundedRect(-width / 2 + 4, height / 2 - 13, width - 8, 9, 5);
      bg.lineStyle(3, 0x29457a, 0.4);
      bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 8);
      this.container.add(bg);
    }

    this.slotMarkers = [];
    for (let i = 0; i < this.capacity; i += 1) {
      const x = -width / 2 + (i + 1) * (width / (this.capacity + 1));
      const y = hasArtTexture(this.scene, boxKey) ? -5 : 0;
      if (!hasArtTexture(this.scene, boxKey)) {
        const marker = this.scene.add.graphics();
        marker.fillStyle(0x23385f, 0.28);
        marker.fillCircle(x, y, radius + 3);
        marker.fillStyle(0xffffff, 0.16);
        marker.fillCircle(x - 2, y - 2, radius);
        marker.lineStyle(2, 0xffffff, 0.5);
        marker.strokeCircle(x, y, radius);
        this.container.add(marker);
      }
      this.slotMarkers.push({ x, y });
    }
  }

  canAccept(color: ColorId): boolean {
    return canAcceptBoxSlot({
      color: this.color,
      reservedCount: this.current_count,
      capacity: this.capacity,
    }, color);
  }

  reserveSlot(): ReservedBoxSlot | null {
    const slotIdx = reserveBoxSlotIndex(this.current_count, this.capacity);
    if (slotIdx === null) return null;
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
    const marbleKey = marbleArtKey(marble?.color ?? this.color);

    if (hasArtTexture(this.scene, marbleKey)) {
      const filled = this.scene.add.image(marker.x, marker.y, marbleKey).setDisplaySize(28, 28);
      filled.setScale(0.35);
      filled.setAlpha(0.55);
      this.container.add(filled);
      this.scene.tweens.add({
        targets: filled,
        scale: 1,
        alpha: 1,
        duration: 180,
        ease: 'Back.easeOut',
      });
    } else {
      const filled = this.scene.add.graphics();
      filled.fillStyle(0x23385f, 0.2);
      filled.fillCircle(marker.x + 2, marker.y + 3, CONFIG.BOX_COLUMNS.SLOT_RADIUS + 1);
      filled.fillStyle(color.hex, 1);
      filled.fillCircle(marker.x, marker.y, CONFIG.BOX_COLUMNS.SLOT_RADIUS);
      filled.fillStyle(0xffffff, 0.42);
      filled.fillCircle(marker.x - 4, marker.y - 4, 4);
      filled.lineStyle(2, 0xffffff, 0.36);
      filled.strokeCircle(marker.x, marker.y, CONFIG.BOX_COLUMNS.SLOT_RADIUS);
      filled.setAlpha(0.55);
      this.container.add(filled);
      this.scene.tweens.add({
        targets: filled,
        alpha: 1,
        duration: 150,
        ease: 'Quad.easeOut',
      });
    }

    this._playCollectEffect(marker, color.hex);
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

  private _playCollectEffect(marker: SlotMarker, color: number): void {
    const worldX = this.container.x + marker.x;
    const worldY = this.container.y + marker.y;
    const ring = this.scene.add.circle(worldX, worldY, 8, 0xffffff, 0);
    ring.setStrokeStyle(4, 0xffffff, 0.78);
    ring.setDepth(96);

    this.scene.tweens.add({
      targets: ring,
      scale: 2.3,
      alpha: 0,
      duration: 220,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    });

    for (let i = 0; i < 8; i += 1) {
      const angle = (Math.PI * 2 * i) / 8;
      const distance = 18 + (i % 2) * 8;
      const particle = this.scene.add.circle(worldX, worldY, 4, color, 0.95);
      particle.setStrokeStyle(1, 0xffffff, 0.45);
      particle.setDepth(97);

      this.scene.tweens.add({
        targets: particle,
        x: worldX + Math.cos(angle) * distance,
        y: worldY + Math.sin(angle) * distance,
        scale: 0.25,
        alpha: 0,
        duration: 240,
        ease: 'Cubic.easeOut',
        onComplete: () => particle.destroy(),
      });
    }
  }

  destroyWithAnimation(onComplete: (() => void) | null = null): void {
    this._playDestroyStars();
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

  private _playDestroyStars(): void {
    const originX = this.container.x;
    const originY = this.container.y;
    const starColors = [0xffffff, 0xfff07a, 0xffd236];

    for (let i = 0; i < 16; i += 1) {
      const angle = -Math.PI / 2 + (i - 7.5) * 0.28;
      const distance = 58 + (i % 4) * 16;
      const star = this.scene.add.star(
        originX,
        originY - 4,
        5,
        6,
        15,
        starColors[i % starColors.length],
        0.95,
      );
      star.setDepth(102);
      star.setRotation(angle * 0.35);
      star.setScale(0.55);

      this.scene.tweens.add({
        targets: star,
        x: originX + Math.cos(angle) * distance,
        y: originY + Math.sin(angle) * distance - 18,
        scale: { from: 0.55, to: 1.25 },
        rotation: star.rotation + 2.2,
        alpha: 0,
        duration: 520,
        ease: 'Cubic.easeOut',
        onComplete: () => star.destroy(),
      });
    }
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
