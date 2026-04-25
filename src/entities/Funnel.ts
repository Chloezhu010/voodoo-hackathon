import { CONFIG } from '../config/constants.js';

export class Funnel {
  readonly scene: Phaser.Scene;
  readonly graphics: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(20);
    this.render();
  }

  render(): void {
    const area = CONFIG.FUNNEL_AREA;
    const topLeft = { x: area.x, y: area.y + 8 };
    const topRight = { x: area.x + area.width, y: area.y + 8 };
    const bottomRight = { x: area.x + area.width * 0.58, y: area.y + area.height - 8 };
    const bottomLeft = { x: area.x + area.width * 0.42, y: area.y + area.height - 8 };

    this.graphics.clear();
    this.graphics.fillStyle(0xffffff, 0.08);
    this.graphics.lineStyle(4, 0xffffff, 0.22);
    this.graphics.beginPath();
    this.graphics.moveTo(topLeft.x, topLeft.y);
    this.graphics.lineTo(topRight.x, topRight.y);
    this.graphics.lineTo(bottomRight.x, bottomRight.y);
    this.graphics.lineTo(bottomLeft.x, bottomLeft.y);
    this.graphics.closePath();
    this.graphics.fillPath();
    this.graphics.strokePath();
  }
}
