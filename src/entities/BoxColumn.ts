import { getColorDefinition, type ColorDefinition } from '../config/colors.js';
import { CONFIG } from '../config/constants.js';
import { canAcceptTopBoxColor } from '../sim/boxColumnRules.js';
import type { ColorId } from '../sim/types.js';

import { Box, type ReservedBoxSlot } from './Box.js';
import type { Marble } from './Marble.js';
import type { OutputPort } from './OutputPort.js';

export class BoxColumn {
  readonly scene: Phaser.Scene;
  readonly columnIndex: number;
  readonly x: number;
  boxes: Box[] = [];
  outputPort: OutputPort | null = null;
  private _clearedEmitted = false;

  constructor(scene: Phaser.Scene, columnIndex: number, colorSequence: readonly ColorId[], x: number) {
    this.scene = scene;
    this.columnIndex = columnIndex;
    this.x = x;
    this._buildBoxes(colorSequence);
  }

  private _buildBoxes(colorSequence: readonly ColorId[]): void {
    const area = CONFIG.BOX_COLUMNS.AREA;
    const height = CONFIG.BOX_COLUMNS.BOX_HEIGHT;
    const gap = CONFIG.BOX_COLUMNS.BOX_GAP;
    const topY = area.y + height / 2;

    colorSequence.forEach((color, index) => {
      const box = new Box(this.scene, color);
      box.setPosition(this.x, topY + index * (height + gap));
      this.boxes.push(box);
    });
    this._updateBoxDepths();
  }

  canAcceptColor(color: ColorId): boolean {
    return canAcceptTopBoxColor({
      boxes: this.boxes.map((box) => ({
        color: box.color,
        reservedCount: box.current_count,
        capacity: box.capacity,
      })),
    }, color);
  }

  reserveSlotForColor(color: ColorId): ReservedBoxSlot | null {
    if (!this.canAcceptColor(color)) return null;
    const box = this.boxes[0]!;
    const slot = box.reserveSlot();
    if (box.isReservedFull()) this._advanceTopBox(box);
    return slot;
  }

  fillVisualSlot(marble: Marble): void {
    if (this.boxes.length === 0) return;
    this.boxes[0]!.fillVisualSlot(marble);
  }

  onBoxFull(box: Box): void {
    this._advanceTopBox(box);
  }

  private _advanceTopBox(box: Box): void {
    if (this.boxes[0] !== box) return;

    this.boxes.shift();

    box.onVisualFull = () => {
      this._tweenBoxesToCurrentPositions();
      if (this.outputPort) this.outputPort.notifyColumnChanged();
      this._emitClearedIfNeeded();
    };
  }

  private _tweenBoxesToCurrentPositions(): void {
    const area = CONFIG.BOX_COLUMNS.AREA;
    const height = CONFIG.BOX_COLUMNS.BOX_HEIGHT;
    const gap = CONFIG.BOX_COLUMNS.BOX_GAP;
    const topY = area.y + height / 2;
    this.boxes.forEach((current, index) => {
      current.tweenPosition(this.x, topY + index * (height + gap), 350);
    });
    this._updateBoxDepths();
  }

  private _updateBoxDepths(): void {
    this.boxes.forEach((box, index) => {
      box.container.setDepth(90 + index);
    });
  }

  getTopBoxColor(): ColorDefinition | null {
    if (this.boxes.length === 0) return null;
    return getColorDefinition(this.boxes[0]!.color);
  }

  getColorSequence(): ColorId[] {
    return this.boxes.map((box) => box.color);
  }

  isEmpty(): boolean {
    return this.boxes.length === 0;
  }

  private _emitClearedIfNeeded(): void {
    if (this.boxes.length > 0 || this._clearedEmitted) return;
    this._clearedEmitted = true;
    this.scene.events.emit('column-cleared', this);
  }
}
