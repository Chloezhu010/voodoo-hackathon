import { CONFIG } from '../config/constants.js';

export class ConveyorTrack {
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

  positionAt(t) {
    const normalized = ((t % 1) + 1) % 1;

    if (normalized < 0.4) {
      const localT = normalized / 0.4;
      return {
        x: this.leftX + (this.rightX - this.leftX) * localT,
        y: this.topY
      };
    }

    if (normalized < 0.5) {
      const localT = (normalized - 0.4) / 0.1;
      const angle = -Math.PI / 2 + Math.PI * localT;
      return {
        x: this.rightX + this.r * Math.cos(angle),
        y: this.cy + this.verticalRadius * Math.sin(angle)
      };
    }

    if (normalized < 0.9) {
      const localT = (normalized - 0.5) / 0.4;
      return {
        x: this.rightX - (this.rightX - this.leftX) * localT,
        y: this.bottomY
      };
    }

    const localT = (normalized - 0.9) / 0.1;
    const angle = Math.PI / 2 + Math.PI * localT;
    return {
      x: this.leftX + this.r * Math.cos(angle),
      y: this.cy + this.verticalRadius * Math.sin(angle)
    };
  }

  get entryT() {
    return this.tForUpperLayerX(CONFIG.FUNNEL_AREA.x + CONFIG.FUNNEL_AREA.width / 2);
  }

  tForUpperLayerX(x) {
    const ratio = (x - this.leftX) / (this.rightX - this.leftX);
    const clamped = Math.max(0, Math.min(1, ratio));
    return clamped * 0.4;
  }

  tForLowerLayerX(x) {
    const ratio = (this.rightX - x) / (this.rightX - this.leftX);
    const clamped = Math.max(0, Math.min(1, ratio));
    return 0.5 + clamped * 0.4;
  }
}

export default ConveyorTrack;
