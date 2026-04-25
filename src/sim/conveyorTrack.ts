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
    this.leftX = conveyor.AREA.x + conveyor.TRACK_LEFT_OFFSET;
    this.rightX = conveyor.AREA.x + conveyor.TRACK_RIGHT_OFFSET;
    this.topY = conveyor.AREA.y + conveyor.TRACK_TOP_OFFSET;
    this.bottomY = conveyor.AREA.y + conveyor.TRACK_BOTTOM_OFFSET;
    this.cx = conveyor.AREA.x + conveyor.AREA.width / 2;
    this.cy = (this.topY + this.bottomY) / 2;
    this.r = conveyor.TRACK_SIDE_RADIUS;
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
    return this.tForUpperLayerX(CONFIG.FUNNEL_AREA.x + CONFIG.FUNNEL_AREA.width / 2);
  }

  tForUpperLayerX(x: number): number {
    const ratio = (x - this.leftX) / (this.rightX - this.leftX);
    const clamped = Math.max(0, Math.min(1, ratio));
    return clamped * 0.4;
  }

  tForLowerLayerX(x: number): number {
    if (x > this.rightX) {
      const ratio = Math.max(0, Math.min(1, (x - this.rightX) / this.r));
      const angle = Math.acos(ratio);
      return 0.4 + ((angle + Math.PI / 2) / Math.PI) * 0.1;
    }

    if (x < this.leftX) {
      const ratio = Math.max(-1, Math.min(0, (x - this.leftX) / this.r));
      const angle = Math.acos(ratio);
      return 0.9 + ((angle - Math.PI / 2) / Math.PI) * 0.1;
    }

    const ratio = (this.rightX - x) / (this.rightX - this.leftX);
    return 0.5 + ratio * 0.4;
  }
}
