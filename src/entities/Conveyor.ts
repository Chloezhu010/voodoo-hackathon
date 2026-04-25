import { CONFIG } from '../config/constants.js';
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
  private _entryOffset = 0;
  trackGraphics?: Phaser.GameObjects.Graphics;
  tickGraphics?: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, speed: number = CONFIG.CONVEYOR.DEFAULT_SPEED) {
    this.scene = scene;
    this.track = new ConveyorTrack();
    this.speed = speed;
    this._renderTrack();
  }

  private _renderTrack(): void {
    const graphics = this.scene.add.graphics();
    graphics.setDepth(35);
    this._strokeTrack(graphics, 36, 0x2a2a3e, 1);
    this._strokeTrack(graphics, 24, 0x34344c, 1);
    this._strokeTrack(graphics, 2, 0xffffff, 0.16);
    this.trackGraphics = graphics;

    const tickGraphics = this.scene.add.graphics();
    tickGraphics.setDepth(36);
    for (let i = 0; i < CONFIG.CONVEYOR.TOTAL_CAPACITY; i += 1) {
      const pos = this.track.positionAt(i / CONFIG.CONVEYOR.TOTAL_CAPACITY);
      tickGraphics.fillStyle(0xffffff, 0.08);
      tickGraphics.fillCircle(pos.x, pos.y, 3);
    }
    this.tickGraphics = tickGraphics;
  }

  private _strokeTrack(graphics: Phaser.GameObjects.Graphics, width: number, color: number, alpha: number): void {
    graphics.lineStyle(width, color, alpha);
    graphics.beginPath();
    const first = this.track.positionAt(0);
    graphics.moveTo(first.x, first.y);
    for (let i = 1; i <= 96; i += 1) {
      const pos = this.track.positionAt(i / 96);
      graphics.lineTo(pos.x, pos.y);
    }
    graphics.lineTo(first.x, first.y);
    graphics.strokePath();
  }

  registerOutputPort(port: OutputPort): void {
    this.outputPorts.push(port);
  }

  acceptMarble(marble: Marble): boolean {
    if (this.marbles.length >= CONFIG.CONVEYOR.TOTAL_CAPACITY) {
      this._handleOverflow(marble);
      return false;
    }

    marble.state = 'on-conveyor';
    marble.t = (this.track.entryT - this._entryOffset * 0.006 + 1) % 1;
    this._entryOffset = (this._entryOffset + 1) % CONFIG.CONVEYOR.TOTAL_CAPACITY;
    this.marbles.push(marble);

    const pos = this.track.positionAt(marble.t);
    marble.setPositionDirect(pos.x, pos.y);
    return true;
  }

  private _handleOverflow(marble: Marble): void {
    marble.state = 'overflow-exit';
    if (marble.sprite) {
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
    } else {
      marble.destroy();
    }

    if (!this._overflowFired) {
      this._overflowFired = true;
      this.scene.events.emit('conveyor-overflow');
    }
  }

  update(dt: number): void {
    if (this.isPaused) return;
    const advance = this.speed * (dt / 1000);

    for (const marble of this.marbles.slice()) {
      if (marble.state !== 'on-conveyor') continue;
      marble.t = (marble.t + advance) % 1;
      const pos = this.track.positionAt(marble.t);
      marble.setPositionDirect(pos.x, pos.y);

      for (const port of this.outputPorts) {
        if (this._tDistance(marble.t, port.t) >= CONFIG.OUTPUT_PORTS.DETECT_EPSILON) continue;
        if (port.boxColumn.canAcceptColor(marble.color)) {
          this._dropMarble(marble, port);
          break;
        }
      }
    }
  }

  private _tDistance(a: number, b: number): number {
    const distance = Math.abs(a - b);
    return Math.min(distance, 1 - distance);
  }

  private _dropMarble(marble: Marble, port: OutputPort): void {
    const index = this.marbles.indexOf(marble);
    if (index !== -1) this.marbles.splice(index, 1);

    marble.state = 'dropping-to-box';
    const target = port.boxColumn.reserveSlotForColor(marble.color);
    if (!target) {
      marble.destroy();
      return;
    }

    marble.flyTo(target.x, target.y, CONFIG.MARBLE_PORT_DROP_DURATION, 'Quad.easeIn', () => {
      port.boxColumn.fillVisualSlot(marble);
      marble.destroy();
    });
  }

  magnetize(color: ColorId): number {
    const matched = this.marbles.filter((marble) => (
      marble.state === 'on-conveyor' && marble.color === color
    ));

    matched.forEach((marble, index) => {
      const marbleIndex = this.marbles.indexOf(marble);
      if (marbleIndex !== -1) this.marbles.splice(marbleIndex, 1);

      this.scene.time.delayedCall(index * 80, () => {
        const port = this.outputPorts.find((candidate) => candidate.boxColumn.canAcceptColor(color));
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
        marble.flyTo(CONFIG.GAME_WIDTH / 2, -100, 400, 'Cubic.easeOut', () => marble.destroy());
      });
    });

    return matched.length;
  }

  setPaused(paused: boolean): void {
    this.isPaused = paused;
    this.trackGraphics?.setAlpha(paused ? 0.45 : 1);
    this.tickGraphics?.setAlpha(paused ? 0.35 : 1);
  }

  count(): number {
    return this.marbles.length;
  }
}
