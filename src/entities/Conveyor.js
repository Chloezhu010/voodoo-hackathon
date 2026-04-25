import { CONFIG } from '../config/constants.js';
import ConveyorTrack from '../systems/ConveyorTrack.js';

export default class Conveyor {
  constructor(scene, speed = CONFIG.CONVEYOR.DEFAULT_SPEED) {
    this.scene = scene;
    this.track = new ConveyorTrack();
    this.speed = speed;
    this.marbles = [];
    this.outputPorts = [];
    this.isPaused = false;
    this._overflowFired = false;
    this._slotOffset = 0;
    this._reservedSlots = new Set();
    this.slotCount = CONFIG.CONVEYOR.TOTAL_CAPACITY;

    this._renderTrack();
  }

  _renderTrack() {
    const graphics = this.scene.add.graphics();
    graphics.setDepth(35);
    this._strokeTrack(graphics, 36, 0x2a2a3e, 1);
    this._strokeTrack(graphics, 24, 0x34344c, 1);
    this._strokeTrack(graphics, 2, 0xffffff, 0.16);
    this.trackGraphics = graphics;

    this.slotGraphics = this.scene.add.graphics();
    this.slotGraphics.setDepth(36);
    this._drawSlots();
  }

  _strokeTrack(graphics, width, color, alpha) {
    graphics.lineStyle(width, color, alpha);
    graphics.beginPath();
    const first = this.track.positionAt(0);
    graphics.moveTo(first.x, first.y);
    for (let i = 1; i <= 96; i += 1) {
      const pos = this.track.positionAt(i / 96);
      graphics.lineTo(pos.x, pos.y);
    }
    graphics.lineTo(first.x, first.y);
    graphics.strokePath();
  }

  registerOutputPort(port) {
    this.outputPorts.push(port);
  }

  reserveEntrySlot({ maxDistance = null } = {}) {
    const slotIndex = this._findEntrySlot(maxDistance);
    if (slotIndex === null) return null;
    this._reservedSlots.add(slotIndex);
    return {
      slotIndex,
      ...this._slotPosition(slotIndex)
    };
  }

  releaseReservedSlot(slotIndex) {
    if (Number.isInteger(slotIndex)) this._reservedSlots.delete(slotIndex);
  }

  getEntryPosition() {
    const slotIndex = this._findEntrySlot();
    if (slotIndex === null) return this.track.positionAt(this.track.entryT);
    return this._slotPosition(slotIndex);
  }

  acceptMarble(marble, reservedSlotIndex = null) {
    const hasReservedSlot = Number.isInteger(reservedSlotIndex);
    if (hasReservedSlot) this._reservedSlots.delete(reservedSlotIndex);

    if (!hasReservedSlot && this.count() >= this.slotCount) {
      this._handleOverflow(marble);
      return false;
    }

    let slotIndex = hasReservedSlot ? reservedSlotIndex : this._findEntrySlot();
    if (!Number.isInteger(slotIndex) || !this._isSlotFree(slotIndex, marble)) {
      slotIndex = this._findEntrySlot();
    }

    if (!Number.isInteger(slotIndex)) {
      this._handleOverflow(marble);
      return false;
    }

    if (!this.marbles.includes(marble)) this.marbles.push(marble);
    this._assignSlot(marble, slotIndex);
    this._drawSlots();
    return true;
  }

  rejectMarble(marble) {
    this._handleOverflow(marble);
  }

  _handleOverflow(marble) {
    if (marble) marble.state = 'overflow-exit';
    if (marble?.sprite) {
      this.scene.tweens.add({
        targets: marble.sprite,
        x: marble.sprite.x + Phaser.Math.Between(-8, 8),
        duration: 60,
        repeat: 4,
        yoyo: true,
        onComplete: () => {
          marble.flyTo(marble.sprite.x, marble.sprite.y - 200, 400, 'Cubic.easeIn', () => marble.destroy());
        }
      });
    } else if (marble) {
      marble.destroy();
    }

    if (!this._overflowFired) {
      this._overflowFired = true;
      this.scene.events.emit('conveyor-overflow');
    }
  }

  update(dt) {
    if (this.isPaused) {
      this._drawSlots();
      return;
    }

    for (const marble of this.marbles) {
      if (marble.state === 'on-conveyor') this._ensureSlotForMarble(marble);
    }

    const advance = this.speed * (dt / 1000);
    this._slotOffset = (this._slotOffset + advance) % 1;
    this._drawSlots();

    for (const marble of this.marbles.slice()) {
      if (marble.state !== 'on-conveyor') continue;
      if (!this._ensureSlotForMarble(marble)) continue;

      marble.t = this._slotT(marble.slotIndex);
      const pos = this._slotPosition(marble.slotIndex);
      marble.setPositionDirect(pos.x, pos.y);

      for (const port of this.outputPorts) {
        if (this._tDistance(marble.t, port.t) >= CONFIG.OUTPUT_PORTS.DETECT_EPSILON) continue;
        if (port.boxColumn.canAcceptColor(marble.color)) {
          this._dropMarble(marble, port);
          break;
        }
      }
    }

    this._checkDeadlock();
  }

  _tDistance(a, b) {
    const distance = Math.abs(a - b);
    return Math.min(distance, 1 - distance);
  }

  _dropMarble(marble, port) {
    const index = this.marbles.indexOf(marble);
    if (index !== -1) this.marbles.splice(index, 1);
    this._releaseMarbleSlot(marble);
    this._drawSlots();

    marble.state = 'dropping-to-box';
    const target = port.boxColumn.reserveSlotForColor(marble.color);
    if (!target) {
      marble.destroy();
      return;
    }

    marble.flyTo(target.x, target.y, CONFIG.MARBLE_PORT_DROP_DURATION, 'Quad.easeIn', () => {
      target.box.fillVisualSlot(marble);
      marble.destroy();
    });
  }

  _checkDeadlock() {
    if (this._overflowFired) return;
    const activeMarbles = this.marbles.filter((marble) => marble.state === 'on-conveyor');
    if (activeMarbles.length < this.slotCount) return;

    const activeColors = new Set(activeMarbles.map((marble) => marble.color));
    const canEventuallyDrain = this.outputPorts.some((port) => (
      [...activeColors].some((color) => port.boxColumn.canAcceptColor(color))
    ));
    if (canEventuallyDrain) return;

    this._handleOverflow(null);
  }

  magnetize(color) {
    const matched = this.marbles.filter((marble) => (
      marble.state === 'on-conveyor' && marble.color === color
    ));

    matched.forEach((marble, index) => {
      const marbleIndex = this.marbles.indexOf(marble);
      if (marbleIndex !== -1) this.marbles.splice(marbleIndex, 1);
      this._releaseMarbleSlot(marble);

      this.scene.time.delayedCall(index * 80, () => {
        const port = this.outputPorts.find((candidate) => candidate.boxColumn.canAcceptColor(color));
        if (port) {
          marble.state = 'flying-to-magnet-target';
          const target = port.boxColumn.reserveSlotForColor(color);
          if (target) {
            marble.flyTo(target.x, target.y, 400, 'Cubic.easeOut', () => {
              target.box.fillVisualSlot(marble);
              marble.destroy();
            });
            return;
          }
        }

        marble.state = 'overflow-exit';
        marble.flyTo(CONFIG.GAME_WIDTH / 2, -100, 400, 'Cubic.easeOut', () => marble.destroy());
      });
    });

    this._drawSlots();
    return matched.length;
  }

  setPaused(paused) {
    this.isPaused = paused;
    this.trackGraphics?.setAlpha(paused ? 0.45 : 1);
    this.slotGraphics?.setAlpha(paused ? 0.35 : 1);
  }

  count() {
    return this.marbles.length + this._reservedSlots.size;
  }

  _drawSlots() {
    if (!this.slotGraphics) return;
    const occupied = this._usedSlots();
    const radius = CONFIG.MARBLE_RADIUS + 5;
    this.slotGraphics.clear();

    for (let i = 0; i < this.slotCount; i += 1) {
      const pos = this._slotPosition(i);
      const isUsed = occupied.has(i);
      this.slotGraphics.fillStyle(isUsed ? 0xffffff : 0x000000, isUsed ? 0.13 : 0.1);
      this.slotGraphics.fillCircle(pos.x, pos.y, radius);
      this.slotGraphics.lineStyle(2, 0xffffff, isUsed ? 0.42 : 0.2);
      this.slotGraphics.strokeCircle(pos.x, pos.y, radius);
    }
  }

  _slotT(slotIndex) {
    return ((slotIndex / this.slotCount + this._slotOffset) % 1 + 1) % 1;
  }

  _slotPosition(slotIndex) {
    return this.track.positionAt(this._slotT(slotIndex));
  }

  _findEntrySlot(maxDistance = null) {
    const slotIndex = this._nearestFreeSlotIndexForT(this.track.entryT);
    if (slotIndex === null) return null;
    if (
      Number.isFinite(maxDistance)
      && this._tDistance(this._slotT(slotIndex), this.track.entryT) > maxDistance
    ) {
      return null;
    }
    return slotIndex;
  }

  _nearestFreeSlotIndexForT(t, marble) {
    const slots = Array.from({ length: this.slotCount }, (_value, index) => index);
    slots.sort((a, b) => (
      this._tDistance(this._slotT(a), t) - this._tDistance(this._slotT(b), t)
    ));
    return slots.find((slotIndex) => this._isSlotFree(slotIndex, marble)) ?? null;
  }

  _ensureSlotForMarble(marble) {
    if (Number.isInteger(marble.slotIndex) && marble.slotIndex >= 0) return true;
    const slotIndex = this._nearestFreeSlotIndexForT(marble.t >= 0 ? marble.t : this.track.entryT, marble);
    if (!Number.isInteger(slotIndex)) return false;
    marble.slotIndex = slotIndex;
    return true;
  }

  _assignSlot(marble, slotIndex) {
    marble.state = 'on-conveyor';
    marble.slotIndex = slotIndex;
    marble.t = this._slotT(slotIndex);
    const pos = this._slotPosition(slotIndex);
    marble.setPositionDirect(pos.x, pos.y);
  }

  _releaseMarbleSlot(marble) {
    marble.slotIndex = -1;
  }

  _isSlotFree(slotIndex, ignoreMarble = null) {
    if (this._reservedSlots.has(slotIndex)) return false;
    return !this.marbles.some((marble) => (
      marble !== ignoreMarble
      && marble.state === 'on-conveyor'
      && marble.slotIndex === slotIndex
    ));
  }

  _usedSlots() {
    const used = new Set(this._reservedSlots);
    for (const marble of this.marbles) {
      if (marble.state === 'on-conveyor' && Number.isInteger(marble.slotIndex) && marble.slotIndex >= 0) {
        used.add(marble.slotIndex);
      }
    }
    return used;
  }
}
