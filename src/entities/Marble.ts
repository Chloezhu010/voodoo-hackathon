import { getColorDefinition } from '../config/colors.js';
import { CONFIG } from '../config/constants.js';
import type { ColorId } from '../sim/types.js';

export type MarbleState =
  | 'created'
  | 'moving-to-funnel-mouth'
  | 'falling-into-funnel'
  | 'in-funnel-physics'
  | 'leaving-funnel'
  | 'on-conveyor'
  | 'dropping-to-box'
  | 'flying-to-magnet-target'
  | 'overflow-exit'
  | 'destroyed';

export class Marble {
  readonly scene: Phaser.Scene;
  readonly color: ColorId;
  state: MarbleState = 'created';
  t = -1;
  slotIndex = -1;
  funnelSlotIndex = -1;
  sprite: Phaser.GameObjects.Graphics | null;
  private _flightId = 0;
  private _flightGuard: Phaser.Time.TimerEvent | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, color: ColorId) {
    this.scene = scene;
    this.color = color;
    const sprite = scene.add.graphics();
    sprite.setDepth(400);
    sprite.fillStyle(0x263f73, 0.22);
    sprite.fillCircle(3, 4, CONFIG.MARBLE_RADIUS + 1);
    sprite.fillStyle(getColorDefinition(color).hex, 1);
    sprite.fillCircle(0, 0, CONFIG.MARBLE_RADIUS);
    sprite.fillStyle(0xffffff, 0.45);
    sprite.fillCircle(-5, -5, 5);
    sprite.fillStyle(0xffffff, 0.18);
    sprite.fillCircle(-2, -2, CONFIG.MARBLE_RADIUS * 0.56);
    sprite.lineStyle(2, 0xffffff, 0.35);
    sprite.strokeCircle(0, 0, CONFIG.MARBLE_RADIUS);
    sprite.x = x;
    sprite.y = y;
    this.sprite = sprite;
  }

  flyTo(
    targetX: number,
    targetY: number,
    duration = 300,
    ease: string = 'Cubic.easeOut',
    onComplete: (() => void) | null = null,
  ): Phaser.Tweens.Tween | undefined {
    if (!this.sprite || this.state === 'destroyed') return undefined;
    this._flightId += 1;
    const flightId = this._flightId;
    let completed = false;

    const completeFlight = (): void => {
      if (completed || this._flightId !== flightId || !this.sprite || this.state === 'destroyed') return;
      completed = true;
      this.sprite.x = targetX;
      this.sprite.y = targetY;
      if (this._flightGuard) {
        this._flightGuard.remove(false);
        this._flightGuard = null;
      }
      if (onComplete) onComplete();
    };

    this.scene.tweens.killTweensOf(this.sprite);
    if (this._flightGuard) {
      this._flightGuard.remove(false);
      this._flightGuard = null;
    }

    const tween = this.scene.tweens.add({
      targets: this.sprite,
      x: targetX,
      y: targetY,
      duration,
      ease,
      onComplete: completeFlight,
    });
    this._flightGuard = this.scene.time.delayedCall(duration + 120, completeFlight);
    return tween;
  }

  setPositionDirect(x: number, y: number): void {
    if (!this.sprite || this.state === 'destroyed') return;
    this.sprite.x = x;
    this.sprite.y = y;
  }

  destroy(): void {
    this.state = 'destroyed';
    this.t = -1;
    this.slotIndex = -1;
    this.funnelSlotIndex = -1;
    this._flightId += 1;
    if (this._flightGuard) {
      this._flightGuard.remove(false);
      this._flightGuard = null;
    }
    if (this.sprite) {
      this.scene.tweens.killTweensOf(this.sprite);
      this.sprite.destroy();
      this.sprite = null;
    }
  }
}
