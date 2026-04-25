import { CONFIG } from '../config/constants.js';
import { getColorDefinition } from '../config/colors.js';
import Box from './Box.js';

export default class BoxColumn {
  constructor(scene, columnIndex, colorSequence, x) {
    this.scene = scene;
    this.columnIndex = columnIndex;
    this.x = x;
    this.boxes = [];
    this.outputPort = null;
    this._clearedEmitted = false;

    this._buildBoxes(colorSequence);
  }

  _buildBoxes(colorSequence) {
    const area = CONFIG.BOX_COLUMNS.AREA;
    const height = CONFIG.BOX_COLUMNS.BOX_HEIGHT;
    const gap = CONFIG.BOX_COLUMNS.BOX_GAP;
    const topY = area.y + height / 2;

    colorSequence.forEach((color, index) => {
      const box = new Box(this.scene, color);
      box.setPosition(this.x, topY + index * (height + gap));
      this.boxes.push(box);
    });
  }

  canAcceptColor(color) {
    return this.boxes.length > 0 && this.boxes[0].canAccept(color);
  }

  reserveSlotForColor(color) {
    if (!this.canAcceptColor(color)) return null;
    const box = this.boxes[0];
    const slot = box.reserveSlot();
    if (box.isReservedFull()) this._advanceTopBox(box);
    return slot;
  }

  fillVisualSlot(marble) {
    if (this.boxes.length === 0) return;
    this.boxes[0].fillVisualSlot(marble);
  }

  onBoxFull(box) {
    this._advanceTopBox(box);
  }

  _advanceTopBox(box) {
    if (this.boxes[0] !== box) return;

    this.boxes.shift();
    if (this.outputPort) this.outputPort.notifyColumnChanged();

    box.onVisualFull = () => {
      this._tweenBoxesToCurrentPositions();
      this._emitClearedIfNeeded();
    };
  }

  _tweenBoxesToCurrentPositions() {
    const area = CONFIG.BOX_COLUMNS.AREA;
    const height = CONFIG.BOX_COLUMNS.BOX_HEIGHT;
    const gap = CONFIG.BOX_COLUMNS.BOX_GAP;
    const topY = area.y + height / 2;
    this.boxes.forEach((current, index) => {
      current.tweenPosition(this.x, topY + index * (height + gap), 350);
    });
  }

  getTopBoxColor() {
    if (this.boxes.length === 0) return null;
    return getColorDefinition(this.boxes[0].color);
  }

  getColorSequence() {
    return this.boxes.map((box) => box.color);
  }

  isEmpty() {
    return this.boxes.length === 0;
  }

  _emitClearedIfNeeded() {
    if (this.boxes.length > 0 || this._clearedEmitted) return;
    this._clearedEmitted = true;
    this.scene.events.emit('column-cleared', this);
  }
}
