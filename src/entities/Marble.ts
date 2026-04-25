import { getColorDefinition } from '../config/colors.js';
import { CONFIG } from '../config/constants.js';
import type { ColorId } from '../sim/types.js';

export type MarbleState =
  | 'created'
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
  sprite: Phaser.GameObjects.Graphics | null;

  constructor(scene: Phaser.Scene, x: number, y: number, color: ColorId) {
    this.scene = scene;
    this.color = color;
    const sprite = scene.add.graphics();
    sprite.setDepth(400);
    sprite.fillStyle(getColorDefinition(color).hex, 1);
    sprite.fillCircle(0, 0, CONFIG.MARBLE_RADIUS);
    sprite.fillStyle(0xffffff, 0.45);
    sprite.fillCircle(-5, -5, 5);
    sprite.lineStyle(2, 0x000000, 0.12);
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
    this.scene.tweens.killTweensOf(this.sprite);
    return this.scene.tweens.add({
      targets: this.sprite,
      x: targetX,
      y: targetY,
      duration,
      ease,
      onComplete: () => {
        if (onComplete) onComplete();
      },
    });
  }

  setPositionDirect(x: number, y: number): void {
    if (!this.sprite || this.state === 'destroyed') return;
    this.sprite.x = x;
    this.sprite.y = y;
  }

  destroy(): void {
    this.state = 'destroyed';
    this.t = -1;
    if (this.sprite) {
      this.scene.tweens.killTweensOf(this.sprite);
      this.sprite.destroy();
      this.sprite = null;
    }
  }
}
