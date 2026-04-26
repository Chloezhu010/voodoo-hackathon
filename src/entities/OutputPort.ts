import { hasArtTexture, outputPortArtKey } from '../assets/artAssets.js';
import { CONFIG, UI } from '../config/constants.js';
import type { ConveyorTrack } from '../sim/conveyorTrack.js';

import type { BoxColumn } from './BoxColumn.js';

export class OutputPort {
  readonly scene: Phaser.Scene;
  readonly columnIndex: number;
  readonly boxColumn: BoxColumn;
  readonly x: number;
  readonly y: number;
  readonly t: number;
  readonly gateGraphics: Phaser.GameObjects.Graphics;
  readonly gateImage: Phaser.GameObjects.Image | null;

  constructor(
    scene: Phaser.Scene,
    conveyorTrack: ConveyorTrack,
    columnIndex: number,
    boxColumn: BoxColumn,
  ) {
    this.scene = scene;
    this.columnIndex = columnIndex;
    this.boxColumn = boxColumn;

    const output = CONFIG.OUTPUT_PORTS;
    const conveyor = CONFIG.CONVEYOR;
    const totalSpan = 3 * output.GAP_BETWEEN;
    const startX = conveyor.AREA.x + (conveyor.AREA.width - totalSpan) / 2;
    this.x = startX + columnIndex * output.GAP_BETWEEN;
    this.y = conveyorTrack.bottomY + 20;
    this.t = conveyorTrack.tForLowerLayerX(this.x);

    const emptyKey = outputPortArtKey(null);
    this.gateImage = hasArtTexture(scene, emptyKey)
      ? scene.add.image(this.x, this.y, emptyKey)
        .setOrigin(0.5, 0)
        .setDisplaySize(CONFIG.OUTPUT_PORTS.PORT_WIDTH, 48)
        .setDepth(55)
      : null;
    this.gateGraphics = scene.add.graphics();
    this.gateGraphics.setDepth(55);
    this.notifyColumnChanged();
  }

  notifyColumnChanged(): void {
    this.gateGraphics.clear();
    const topColor = this.boxColumn.getTopBoxColor();
    const imageKey = outputPortArtKey(topColor?.id ?? null);
    if (this.gateImage && hasArtTexture(this.scene, imageKey)) {
      this.gateImage.setTexture(imageKey);
      return;
    }

    if (topColor) {
      this.gateGraphics.fillStyle(topColor.hex, 0.92);
      this.gateGraphics.lineStyle(4, 0xffffff, 0.46);
    } else {
      this.gateGraphics.fillStyle(0xd9e7f6, 0.9);
      this.gateGraphics.lineStyle(4, UI.BLUE_STROKE, 0.38);
    }

    const width = CONFIG.OUTPUT_PORTS.PORT_WIDTH;
    this.gateGraphics.fillStyle(UI.BLUE_STROKE, 0.26);
    this.gateGraphics.fillTriangle(
      this.x - width / 2,
      this.y + 8,
      this.x + width / 2,
      this.y + 8,
      this.x,
      this.y + 38,
    );
    if (topColor) {
      this.gateGraphics.fillStyle(topColor.hex, 0.94);
    } else {
      this.gateGraphics.fillStyle(0xd9e7f6, 0.9);
    }
    this.gateGraphics.fillTriangle(
      this.x - width / 2,
      this.y,
      this.x + width / 2,
      this.y,
      this.x,
      this.y + 30,
    );
    this.gateGraphics.strokeTriangle(
      this.x - width / 2,
      this.y,
      this.x + width / 2,
      this.y,
      this.x,
      this.y + 30,
    );
  }
}
