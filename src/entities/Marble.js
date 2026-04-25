import { CONFIG } from '../config/constants.js';
import { getColorDefinition } from '../config/colors.js';

export default class Marble {
  constructor(scene, x, y, color) {
    this.scene = scene;
    this.color = color;
    this.state = 'created';
    this.t = -1;
    this.slotIndex = -1;
    this._flightId = 0;
    this._flightGuard = null;
    this.sprite = scene.add.graphics();
    this.sprite.setDepth(400);
    this.sprite.fillStyle(0x263f73, 0.22);
    this.sprite.fillCircle(3, 4, CONFIG.MARBLE_RADIUS + 1);
    this.sprite.fillStyle(getColorDefinition(color).hex, 1);
    this.sprite.fillCircle(0, 0, CONFIG.MARBLE_RADIUS);
    this.sprite.fillStyle(0xffffff, 0.45);
    this.sprite.fillCircle(-5, -5, 5);
    this.sprite.fillStyle(0xffffff, 0.18);
    this.sprite.fillCircle(-2, -2, CONFIG.MARBLE_RADIUS * 0.56);
    this.sprite.lineStyle(2, 0xffffff, 0.35);
    this.sprite.strokeCircle(0, 0, CONFIG.MARBLE_RADIUS);
    this.sprite.x = x;
    this.sprite.y = y;
  }

  flyTo(targetX, targetY, duration = 300, ease = 'Cubic.easeOut', onComplete = null) {
    if (!this.sprite || this.state === 'destroyed') return;
    this._flightId += 1;
    const flightId = this._flightId;
    let completed = false;

    const completeFlight = () => {
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
      onComplete: completeFlight
    });
    this._flightGuard = this.scene.time.delayedCall(duration + 120, completeFlight);
    return tween;
  }

  setPositionDirect(x, y) {
    if (!this.sprite || this.state === 'destroyed') return;
    this.sprite.x = x;
    this.sprite.y = y;
  }

  destroy() {
    this.state = 'destroyed';
    this.t = -1;
    this.slotIndex = -1;
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
