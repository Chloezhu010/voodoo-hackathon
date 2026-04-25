import { CONFIG } from '../config/constants.js';
import { getColorDefinition } from '../config/colors.js';

export default class Marble {
  constructor(scene, x, y, color) {
    this.scene = scene;
    this.color = color;
    this.state = 'created';
    this.t = -1;
    this.slotIndex = -1;
    this.sprite = scene.add.graphics();
    this.sprite.setDepth(400);
    this.sprite.fillStyle(getColorDefinition(color).hex, 1);
    this.sprite.fillCircle(0, 0, CONFIG.MARBLE_RADIUS);
    this.sprite.fillStyle(0xffffff, 0.45);
    this.sprite.fillCircle(-5, -5, 5);
    this.sprite.lineStyle(2, 0x000000, 0.12);
    this.sprite.strokeCircle(0, 0, CONFIG.MARBLE_RADIUS);
    this.sprite.x = x;
    this.sprite.y = y;
  }

  flyTo(targetX, targetY, duration = 300, ease = 'Cubic.easeOut', onComplete = null) {
    if (!this.sprite || this.state === 'destroyed') return;
    this.scene.tweens.killTweensOf(this.sprite);
    return this.scene.tweens.add({
      targets: this.sprite,
      x: targetX,
      y: targetY,
      duration,
      ease,
      onComplete: () => {
        if (onComplete) onComplete();
      }
    });
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
    if (this.sprite) {
      this.scene.tweens.killTweensOf(this.sprite);
      this.sprite.destroy();
      this.sprite = null;
    }
  }
}
