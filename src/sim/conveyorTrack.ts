import { CONFIG } from '../config/constants.js';

import type { Vec2 } from './types.js';

/**
 * Geometric description of the conveyor loop. Pure: no Phaser, no time, no random.
 * Position is parameterised by t ∈ [0,1) advancing along the loop.
 */
export class ConveyorTrack {
  readonly cx: number;
  readonly cy: number;
  readonly leftX: number;
  readonly rightX: number;
  readonly topY: number;
  readonly bottomY: number;
  readonly r: number;
  readonly verticalRadius: number;

  constructor() {
    const conveyor = CONFIG.CONVEYOR;
    this.cx = conveyor.AREA.x + conveyor.AREA.width / 2;
    this.cy = conveyor.AREA.y + conveyor.AREA.height / 2;

    this.leftX = conveyor.AREA.x + conveyor.CORNER_RADIUS;
    this.rightX = conveyor.AREA.x + conveyor.AREA.width - conveyor.CORNER_RADIUS;
    this.topY = this.cy + conveyor.UPPER_LAYER_Y_OFFSET;
    this.bottomY = this.cy + conveyor.LOWER_LAYER_Y_OFFSET;
    this.r = conveyor.CORNER_RADIUS;
    this.verticalRadius = Math.abs(this.bottomY - this.topY) / 2;
  }

  positionAt(t: number): Vec2 {
    const normalized = ((t % 1) + 1) % 1;

    if (normalized < 0.4) {
      const localT = normalized / 0.4;
      return { x: this.leftX + (this.rightX - this.leftX) * localT, y: this.topY };
    }

    if (normalized < 0.5) {
      const localT = (normalized - 0.4) / 0.1;
      const angle = -Math.PI / 2 + Math.PI * localT;
      return {
        x: this.rightX + this.r * Math.cos(angle),
        y: this.cy + this.verticalRadius * Math.sin(angle),
      };
    }

    if (normalized < 0.9) {
      const localT = (normalized - 0.5) / 0.4;
      return { x: this.rightX - (this.rightX - this.leftX) * localT, y: this.bottomY };
    }

    const localT = (normalized - 0.9) / 0.1;
    const angle = Math.PI / 2 + Math.PI * localT;
    return {
      x: this.leftX + this.r * Math.cos(angle),
      y: this.cy + this.verticalRadius * Math.sin(angle),
    };
  }

  get entryT(): number {
    return 0;
  }

  tForLowerLayerX(x: number): number {
    const ratio = (this.rightX - x) / (this.rightX - this.leftX);
    const clamped = Math.max(0, Math.min(1, ratio));
    return 0.5 + clamped * 0.4;
  }
}
