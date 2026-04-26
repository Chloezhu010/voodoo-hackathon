import { hasArtTexture, marbleArtKey } from '../assets/artAssets.js';
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
  sprite: Phaser.GameObjects.Graphics | Phaser.GameObjects.Image | null;
  private _flightId = 0;
  private _flightGuard: Phaser.Time.TimerEvent | null = null;
  private _flightTweenTarget: object | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, color: ColorId) {
    this.scene = scene;
    this.color = color;
    const assetKey = marbleArtKey(color);
    if (hasArtTexture(scene, assetKey)) {
      const image = scene.add.image(x, y, assetKey)
        .setDisplaySize(CONFIG.MARBLE_DISPLAY_SIZE, CONFIG.MARBLE_DISPLAY_SIZE);
      image.setDepth(400);
      this.sprite = image;
      return;
    }

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
      this._clearFlightGuard();
      this._flightTweenTarget = null;
      if (onComplete) onComplete();
    };

    this._cancelFlightTween();

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

  followPath(
    duration: number,
    updatePosition: (t: number) => void,
    ease: string = 'Linear',
    onComplete: (() => void) | null = null,
  ): Phaser.Tweens.Tween | undefined {
    if (!this.sprite || this.state === 'destroyed') return undefined;
    this._flightId += 1;
    const flightId = this._flightId;
    const progress = { t: 0 };
    let completed = false;

    const completeFlight = (): void => {
      if (completed || this._flightId !== flightId || !this.sprite || this.state === 'destroyed') return;
      completed = true;
      updatePosition(1);
      this._clearFlightGuard();
      this._flightTweenTarget = null;
      if (onComplete) onComplete();
    };

    this._cancelFlightTween();
    this._flightTweenTarget = progress;
    const tween = this.scene.tweens.add({
      targets: progress,
      t: 1,
      duration,
      ease,
      onUpdate: () => {
        if (this._flightId !== flightId || !this.sprite || this.state === 'destroyed') return;
        updatePosition(progress.t);
      },
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
      this._cancelFlightTween();
      this.sprite.destroy();
      this.sprite = null;
    }
  }

  private _cancelFlightTween(): void {
    if (this.sprite) this.scene.tweens.killTweensOf(this.sprite);
    if (this._flightTweenTarget) {
      this.scene.tweens.killTweensOf(this._flightTweenTarget);
      this._flightTweenTarget = null;
    }
    this._clearFlightGuard();
  }

  private _clearFlightGuard(): void {
    if (!this._flightGuard) return;
    this._flightGuard.remove(false);
    this._flightGuard = null;
  }
}
