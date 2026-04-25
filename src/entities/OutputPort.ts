import { CONFIG } from '../config/constants.js';
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

    this.gateGraphics = scene.add.graphics();
    this.gateGraphics.setDepth(55);
    this.notifyColumnChanged();
  }

  notifyColumnChanged(): void {
    this.gateGraphics.clear();
    const topColor = this.boxColumn.getTopBoxColor();
    if (topColor) {
      this.gateGraphics.fillStyle(topColor.hex, 0.92);
      this.gateGraphics.lineStyle(2, 0xffffff, 0.32);
    } else {
      this.gateGraphics.fillStyle(0x2a2a3e, 0.45);
      this.gateGraphics.lineStyle(2, 0xffffff, 0.12);
    }

    const width = CONFIG.OUTPUT_PORTS.PORT_WIDTH;
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
