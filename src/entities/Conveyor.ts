import { ART_KEYS, hasArtTexture } from '../assets/artAssets.js';
import { CONFIG, UI } from '../config/constants.js';
import { ConveyorTrack } from '../sim/conveyorTrack.js';
import type { ColorId } from '../sim/types.js';

import type { Marble } from './Marble.js';
import type { OutputPort } from './OutputPort.js';

export class Conveyor {
  readonly scene: Phaser.Scene;
  readonly track: ConveyorTrack;
  speed: number;
  marbles: Marble[] = [];
  outputPorts: OutputPort[] = [];
  isPaused = false;
  private _overflowFired = false;
  private _slotOffset = 0;
  private _reservedSlots = new Set<number>();
  slotCount = CONFIG.CONVEYOR.TOTAL_CAPACITY;
  trackGraphics?: Phaser.GameObjects.Graphics;
  trackImage?: Phaser.GameObjects.Image;
  slotGraphics?: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, speed: number = CONFIG.CONVEYOR.DEFAULT_SPEED) {
    this.scene = scene;
    this.track = new ConveyorTrack();
    this.speed = speed;
    this._renderTrack();
  }

  private _renderTrack(): void {
    const area = CONFIG.CONVEYOR.AREA;
    if (hasArtTexture(this.scene, ART_KEYS.conveyorTrack)) {
      this.trackImage = this.scene.add.image(area.x, area.y, ART_KEYS.conveyorTrack)
        .setOrigin(0)
        .setDisplaySize(area.width, area.height)
        .setDepth(35);
    } else {
      const graphics = this.scene.add.graphics();
      graphics.setDepth(35);
      this._strokeTrack(graphics, 52, UI.BLUE_STROKE, 0.95);
      this._strokeTrack(graphics, 42, 0xd9e7f6, 1);
      this._strokeTrack(graphics, 28, 0x8b97ab, 1);
      this._strokeTrack(graphics, 18, 0x5f687d, 1);
      this._strokeTrack(graphics, 3, 0xffffff, 0.38);
      this.trackGraphics = graphics;
    }

    this.slotGraphics = this.scene.add.graphics();
    this.slotGraphics.setDepth(36);
    this._drawSlots();
  }

  private _strokeTrack(graphics: Phaser.GameObjects.Graphics, width: number, color: number, alpha: number): void {
    graphics.lineStyle(width, color, alpha);
    graphics.beginPath();
    const startT = 0.2;
    const first = this.track.positionAt(startT);
    graphics.moveTo(first.x, first.y);
    for (let i = 1; i <= 96; i += 1) {
      const pos = this.track.positionAt(startT + i / 96);
      graphics.lineTo(pos.x, pos.y);
    }
    graphics.closePath();
    graphics.strokePath();
  }

  registerOutputPort(port: OutputPort): void {
    this.outputPorts.push(port);
  }

  reserveEntrySlot({ maxDistance = null }: { maxDistance?: number | null } = {}): (
    { slotIndex: number; x: number; y: number } | null
  ) {
    const slotIndex = this._findEntrySlot(maxDistance);
    if (slotIndex === null) return null;
    this._reservedSlots.add(slotIndex);
    return {
      slotIndex,
      ...this._slotPosition(slotIndex),
    };
  }

  releaseReservedSlot(slotIndex: number): void {
    if (Number.isInteger(slotIndex)) this._reservedSlots.delete(slotIndex);
  }

  getEntryPosition(): { x: number; y: number } {
    const slotIndex = this._findEntrySlot();
    if (slotIndex === null) return this.track.positionAt(this.track.entryT);
    return this._slotPosition(slotIndex);
  }

  acceptMarble(marble: Marble, reservedSlotIndex: number | null = null): boolean {
    const hasReservedSlot = Number.isInteger(reservedSlotIndex);
    const reservedSlot = hasReservedSlot ? reservedSlotIndex as number : null;
    if (reservedSlot !== null) this._reservedSlots.delete(reservedSlot);

    if (!hasReservedSlot && this.count() >= this.slotCount) {
      this._handleOverflow(marble);
      return false;
    }

    let slotIndex = reservedSlot ?? this._findEntrySlot();
    if (slotIndex === null || !this._isSlotFree(slotIndex, marble)) {
      slotIndex = this._findEntrySlot();
    }

    if (slotIndex === null) {
      this._handleOverflow(marble);
      return false;
    }

    if (!this.marbles.includes(marble)) this.marbles.push(marble);
    this._assignSlot(marble, slotIndex);
    this._drawSlots();
    return true;
  }

  rejectMarble(marble: Marble): void {
    this._handleOverflow(marble);
  }

  private _handleOverflow(marble: Marble | null): void {
    if (marble) marble.state = 'overflow-exit';
    if (marble?.sprite) {
      const sprite = marble.sprite;
      this.scene.tweens.add({
        targets: sprite,
        x: sprite.x + Phaser.Math.Between(-8, 8),
        duration: 60,
        repeat: 4,
        yoyo: true,
        onComplete: () => {
          marble.flyTo(sprite.x, sprite.y - 200, 400, 'Cubic.easeIn', () => marble.destroy());
        },
      });
    } else if (marble) {
      marble.destroy();
    }

    if (!this._overflowFired) {
      this._overflowFired = true;
      this.scene.events.emit('conveyor-overflow');
    }
  }

  update(dt: number): void {
    if (this.isPaused) {
      this._drawSlots();
      return;
    }

    for (const marble of this.marbles) {
      if (marble.state === 'on-conveyor') this._ensureSlotForMarble(marble);
    }

    const advance = this.speed * (dt / 1000);
    this._slotOffset = (this._slotOffset + advance) % 1;
    this._drawSlots();

    for (const marble of this.marbles.slice()) {
      if (marble.state !== 'on-conveyor') continue;
      if (!this._ensureSlotForMarble(marble)) continue;

      marble.t = this._slotT(marble.slotIndex);
      const pos = this._slotPosition(marble.slotIndex);
      marble.setPositionDirect(pos.x, pos.y);

      for (const port of this.outputPorts) {
        if (this._tDistance(marble.t, port.t) >= CONFIG.OUTPUT_PORTS.DETECT_EPSILON) continue;
        if (port.boxColumn.canAcceptColor(marble.color)) {
          this._dropMarble(marble, port);
          break;
        }
      }
    }

    this._checkDeadlock();
  }

  private _tDistance(a: number, b: number): number {
    const distance = Math.abs(a - b);
    return Math.min(distance, 1 - distance);
  }

  private _dropMarble(marble: Marble, port: OutputPort): void {
    const index = this.marbles.indexOf(marble);
    if (index !== -1) this.marbles.splice(index, 1);
    this._releaseMarbleSlot(marble);
    this._drawSlots();

    marble.state = 'dropping-to-box';
    const target = port.boxColumn.reserveSlotForColor(marble.color);
    if (!target) {
      marble.destroy();
      return;
    }

    marble.flyTo(target.x, target.y, CONFIG.MARBLE_PORT_DROP_DURATION, 'Quad.easeIn', () => {
      target.box.fillVisualSlot(marble);
      marble.destroy();
    });
  }

  private _checkDeadlock(): void {
    if (this._overflowFired) return;
    const activeMarbles = this.marbles.filter((marble) => marble.state === 'on-conveyor');
    if (activeMarbles.length < this.slotCount) return;

    const activeColors = new Set(activeMarbles.map((marble) => marble.color));
    const canEventuallyDrain = this.outputPorts.some((port) => (
      [...activeColors].some((color) => port.boxColumn.canAcceptColor(color))
    ));
    if (canEventuallyDrain) return;

    this._handleOverflow(null);
  }

  magnetize(color: ColorId): number {
    const matched = this.marbles.filter((marble) => (
      marble.state === 'on-conveyor' && marble.color === color
    ));

    matched.forEach((marble, index) => {
      const marbleIndex = this.marbles.indexOf(marble);
      if (marbleIndex !== -1) this.marbles.splice(marbleIndex, 1);
      this._releaseMarbleSlot(marble);

      this.scene.time.delayedCall(index * 80, () => {
        const port = this.outputPorts.find((candidate) => candidate.boxColumn.canAcceptColor(color));
        if (port) {
          marble.state = 'flying-to-magnet-target';
          const target = port.boxColumn.reserveSlotForColor(color);
          if (target) {
            marble.flyTo(target.x, target.y, 400, 'Cubic.easeOut', () => {
              target.box.fillVisualSlot(marble);
              marble.destroy();
            });
            return;
          }
        }

        marble.state = 'overflow-exit';
        marble.flyTo(CONFIG.GAME_WIDTH / 2, -100, 400, 'Cubic.easeOut', () => marble.destroy());
      });
    });

    this._drawSlots();
    return matched.length;
  }

  setPaused(paused: boolean): void {
    this.isPaused = paused;
    this.trackGraphics?.setAlpha(paused ? 0.45 : 1);
    this.trackImage?.setAlpha(paused ? 0.45 : 1);
    this.slotGraphics?.setAlpha(paused ? 0.35 : 1);
  }

  count(): number {
    return this.marbles.length + this._reservedSlots.size;
  }

  private _drawSlots(): void {
    if (!this.slotGraphics) return;
    const radius = CONFIG.MARBLE_RADIUS + 5;
    this.slotGraphics.clear();

    for (let i = 0; i < this.slotCount; i += 1) {
      const pos = this._slotPosition(i);
      this.slotGraphics.fillStyle(0x565b70, 0.96);
      this.slotGraphics.fillCircle(pos.x, pos.y, radius - 7);
      this.slotGraphics.fillStyle(0xffffff, 0.11);
      this.slotGraphics.fillCircle(pos.x - 3, pos.y - 3, radius - 11);
      this.slotGraphics.lineStyle(2, 0xffffff, 0.18);
      this.slotGraphics.strokeCircle(pos.x, pos.y, radius - 7);
    }
  }

  private _slotT(slotIndex: number): number {
    return ((slotIndex / this.slotCount + this._slotOffset) % 1 + 1) % 1;
  }

  private _slotPosition(slotIndex: number): { x: number; y: number } {
    return this.track.positionAt(this._slotT(slotIndex));
  }

  private _findEntrySlot(maxDistance: number | null = null): number | null {
    const slotIndex = this._nearestFreeSlotIndexForT(this.track.entryT);
    if (slotIndex === null) return null;
    if (
      Number.isFinite(maxDistance)
      && this._tDistance(this._slotT(slotIndex), this.track.entryT) > (maxDistance as number)
    ) {
      return null;
    }
    return slotIndex;
  }

  private _nearestFreeSlotIndexForT(t: number, marble: Marble | null = null): number | null {
    const slots = Array.from({ length: this.slotCount }, (_value, index) => index);
    slots.sort((a, b) => (
      this._tDistance(this._slotT(a), t) - this._tDistance(this._slotT(b), t)
    ));
    return slots.find((slotIndex) => this._isSlotFree(slotIndex, marble)) ?? null;
  }

  private _ensureSlotForMarble(marble: Marble): boolean {
    if (Number.isInteger(marble.slotIndex) && marble.slotIndex >= 0) return true;
    const slotIndex = this._nearestFreeSlotIndexForT(marble.t >= 0 ? marble.t : this.track.entryT, marble);
    if (slotIndex === null) return false;
    marble.slotIndex = slotIndex;
    return true;
  }

  private _assignSlot(marble: Marble, slotIndex: number): void {
    marble.state = 'on-conveyor';
    marble.slotIndex = slotIndex;
    marble.t = this._slotT(slotIndex);
    const pos = this._slotPosition(slotIndex);
    marble.setPositionDirect(pos.x, pos.y);
  }

  private _releaseMarbleSlot(marble: Marble): void {
    marble.slotIndex = -1;
  }

  private _isSlotFree(slotIndex: number, ignoreMarble: Marble | null = null): boolean {
    if (this._reservedSlots.has(slotIndex)) return false;
    return !this.marbles.some((marble) => (
      marble !== ignoreMarble
      && marble.state === 'on-conveyor'
      && marble.slotIndex === slotIndex
    ));
  }

}
