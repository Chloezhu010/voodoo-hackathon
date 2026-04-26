import { CONFIG } from '../config/constants.js';

import type { Conveyor } from './Conveyor.js';
import type { Marble } from './Marble.js';

interface FunnelSlot {
  entryX: number;
  sequence: number;
}

interface FunnelParticle {
  marble: Marble;
  x: number;
  y: number;
  vx: number;
  vy: number;
  sequence: number;
}

export class Funnel {
  readonly scene: Phaser.Scene;
  readonly graphics: Phaser.GameObjects.Graphics;
  particles: FunnelParticle[] = [];
  reservedMarbles = new Set<Marble>();
  isDraining = false;
  private _sequence = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(20);
    this.render();
  }

  render(): void {
    this.graphics.clear();
  }

  reserveSlot(marble: Marble, preferredX?: number): FunnelSlot {
    this._prune();

    this.reservedMarbles.add(marble);
    const sequence = this._sequence;
    const entryXs = this._entryXs(preferredX);
    const entryX = entryXs[sequence % entryXs.length]!;
    this._sequence += 1;
    marble.funnelSlotIndex = sequence;

    return { entryX, sequence };
  }

  dropMarble(marble: Marble, slot: FunnelSlot): void {
    if (!slot || marble.state === 'destroyed') return;
    this.reservedMarbles.delete(marble);
    if (marble.sprite) this.scene.tweens.killTweensOf(marble.sprite);

    marble.state = 'in-funnel-physics';
    const particle: FunnelParticle = {
      marble,
      x: slot.entryX,
      y: CONFIG.FUNNEL_AREA.y + CONFIG.FUNNEL_BUFFER.MOUTH_Y_OFFSET,
      vx: 0,
      vy: CONFIG.FUNNEL_BUFFER.ENTRY_SPEED,
      sequence: slot.sequence,
    };
    this.particles.push(particle);
    marble.setPositionDirect(particle.x, particle.y);
  }

  update(conveyor: Conveyor | undefined, dt = 16): void {
    this._simulate(dt);
    this._tryDrain(conveyor);
  }

  count(): number {
    this._prune();
    return this.reservedMarbles.size + this.particles.length + (this.isDraining ? 1 : 0);
  }

  getMouthPosition(slot: FunnelSlot | null | undefined): { x: number; y: number } {
    return {
      x: slot?.entryX ?? this._centerX(),
      y: CONFIG.FUNNEL_AREA.y + CONFIG.FUNNEL_BUFFER.MOUTH_Y_OFFSET,
    };
  }

  destroy(): void {
    this.graphics.destroy();
    this.particles = [];
    this.reservedMarbles.clear();
  }

  private _simulate(dtMs: number): void {
    this._prune();
    if (this.particles.length === 0) return;

    const substeps = Math.max(1, Math.min(5, Math.ceil(dtMs / 12)));
    const dt = Math.min(dtMs / 1000 / substeps, 1 / 30);

    for (let i = 0; i < substeps; i += 1) {
      for (const particle of this.particles) {
        this._integrateParticle(particle, dt);
        this._collideWalls(particle);
        this._collideFloor(particle);
      }

      this._collideParticles();
    }

    for (const particle of this.particles) {
      particle.marble.setPositionDirect(particle.x, particle.y);
    }
  }

  private _integrateParticle(particle: FunnelParticle, dt: number): void {
    const physics = CONFIG.FUNNEL_BUFFER;
    particle.vy += physics.GRAVITY * dt;

    const speed = Math.hypot(particle.vx, particle.vy);
    if (speed > physics.MAX_SPEED) {
      const scale = physics.MAX_SPEED / speed;
      particle.vx *= scale;
      particle.vy *= scale;
    }

    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
  }

  private _collideWalls(particle: FunnelParticle): void {
    const area = CONFIG.FUNNEL_AREA;
    const centerX = this._centerX();
    const neckEndY = area.y + area.height * 0.8;
    const upperY = area.y + 8;
    const shoulderY = area.y + 78;
    const shoulderHalfWidth = 74;
    const neckHalfWidth = 42;
    const wallSegments = [
      {
        ax: area.x - 14,
        ay: upperY,
        bx: centerX - shoulderHalfWidth,
        by: shoulderY,
      },
      {
        ax: centerX - shoulderHalfWidth,
        ay: shoulderY,
        bx: centerX - neckHalfWidth,
        by: neckEndY,
      },
      {
        ax: area.x + area.width + 14,
        ay: upperY,
        bx: centerX + shoulderHalfWidth,
        by: shoulderY,
      },
      {
        ax: centerX + shoulderHalfWidth,
        ay: shoulderY,
        bx: centerX + neckHalfWidth,
        by: neckEndY,
      },
    ];

    wallSegments.forEach((wall) => this._collideLine(particle, wall));
  }

  private _collideLine(
    particle: FunnelParticle,
    line: { ax: number; ay: number; bx: number; by: number },
  ): void {
    const radius = CONFIG.MARBLE_RADIUS;
    const vx = line.bx - line.ax;
    const vy = line.by - line.ay;
    const lenSq = vx * vx + vy * vy;
    const t = Math.max(0, Math.min(1, (
      (particle.x - line.ax) * vx + (particle.y - line.ay) * vy
    ) / lenSq));
    const closestX = line.ax + vx * t;
    const closestY = line.ay + vy * t;
    let nx = particle.x - closestX;
    let ny = particle.y - closestY;
    let distance = Math.hypot(nx, ny);

    if (distance === 0) {
      nx = this._centerX() - closestX;
      ny = 0;
      distance = Math.abs(nx) || 1;
    }

    nx /= distance;
    ny /= distance;

    const towardCenterX = this._centerX() - closestX;
    if (nx * towardCenterX < 0) {
      nx *= -1;
      ny *= -1;
    }

    if (distance >= radius) return;

    particle.x = closestX + nx * radius;
    particle.y = closestY + ny * radius;

    const normalVelocity = particle.vx * nx + particle.vy * ny;
    if (normalVelocity < 0) {
      const restitution = CONFIG.FUNNEL_BUFFER.WALL_RESTITUTION;
      particle.vx -= (1 + restitution) * normalVelocity * nx;
      particle.vy -= (1 + restitution) * normalVelocity * ny;
      particle.vx *= CONFIG.FUNNEL_BUFFER.WALL_FRICTION;
      particle.vy *= CONFIG.FUNNEL_BUFFER.WALL_FRICTION;
    }
  }

  private _collideFloor(particle: FunnelParticle): void {
    const y = this._floorY();
    if (particle.y <= y) return;

    particle.y = y;
    if (particle.vy > 0) particle.vy *= -CONFIG.FUNNEL_BUFFER.FLOOR_RESTITUTION;
    particle.vx *= CONFIG.FUNNEL_BUFFER.FLOOR_FRICTION;
  }

  private _collideParticles(): void {
    const radius = CONFIG.MARBLE_RADIUS;
    const minDistance = radius * 2;
    const restitution = CONFIG.FUNNEL_BUFFER.BALL_RESTITUTION;

    for (let i = 0; i < this.particles.length; i += 1) {
      for (let j = i + 1; j < this.particles.length; j += 1) {
        const a = this.particles[i]!;
        const b = this.particles[j]!;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distance = Math.hypot(dx, dy);

        if (distance === 0) {
          dx = 1;
          dy = 0;
          distance = 1;
        }

        if (distance >= minDistance) continue;

        const nx = dx / distance;
        const ny = dy / distance;
        const overlap = minDistance - distance;
        a.x -= nx * overlap * 0.5;
        a.y -= ny * overlap * 0.5;
        b.x += nx * overlap * 0.5;
        b.y += ny * overlap * 0.5;

        const relativeVx = b.vx - a.vx;
        const relativeVy = b.vy - a.vy;
        const normalVelocity = relativeVx * nx + relativeVy * ny;
        if (normalVelocity >= 0) continue;

        const impulse = -(1 + restitution) * normalVelocity * 0.5;
        a.vx -= impulse * nx;
        a.vy -= impulse * ny;
        b.vx += impulse * nx;
        b.vy += impulse * ny;
      }
    }
  }

  private _tryDrain(conveyor: Conveyor | undefined): void {
    if (this.isDraining || !conveyor || conveyor.isPaused) return;
    this._prune();

    const particle = this._nextDrainableParticle();
    if (!particle) return;

    const entry = conveyor.reserveEntrySlot({
      maxDistance: CONFIG.FUNNEL_BUFFER.EXIT_TOLERANCE,
    });
    if (!entry) return;

    this._removeParticle(particle);
    const marble = particle.marble;
    marble.funnelSlotIndex = -1;
    marble.state = 'leaving-funnel';
    this.isDraining = true;

    marble.flyTo(
      entry.x,
      entry.y,
      CONFIG.MARBLE_TO_PORT_DURATION,
      'Linear',
      () => {
        if (this._shouldCancelDrain(marble, conveyor, entry)) return;
        conveyor.acceptMarble(marble, entry.slotIndex);
        this.isDraining = false;
        this._tryDrain(conveyor);
      },
    );
  }

  private _nextDrainableParticle(): FunnelParticle | null {
    const readyY = this._floorY() - CONFIG.MARBLE_RADIUS * 0.35;
    return this.particles
      .filter((particle) => particle.y >= readyY)
      .sort((a, b) => a.sequence - b.sequence)[0] ?? null;
  }

  private _removeParticle(particle: FunnelParticle): void {
    const index = this.particles.indexOf(particle);
    if (index !== -1) this.particles.splice(index, 1);
  }

  private _shouldCancelDrain(marble: Marble, conveyor: Conveyor, entry: { slotIndex: number }): boolean {
    if (!(this.scene as { isEnding?: boolean }).isEnding && marble.state !== 'destroyed') return false;
    conveyor.releaseReservedSlot(entry.slotIndex);
    this.isDraining = false;
    return true;
  }

  private _entryXs(preferredX = this._centerX()): number[] {
    const centerX = this._centerX();
    const baseX = clamp(preferredX, centerX - 42, centerX + 42);
    const offsets = [0, -12, 12, -22, 22, -6, 6, -32, 32];
    return offsets.map((offset) => clamp(baseX + offset, centerX - 74, centerX + 74));
  }

  private _floorY(): number {
    const conveyor = CONFIG.CONVEYOR;
    const conveyorTopY = conveyor.AREA.y + conveyor.TRACK_TOP_OFFSET;
    return conveyorTopY - CONFIG.MARBLE_DISPLAY_SIZE / 2 - 28;
  }

  private _centerX(): number {
    const area = CONFIG.FUNNEL_AREA;
    return area.x + area.width / 2;
  }

  private _prune(): void {
    for (const marble of [...this.reservedMarbles]) {
      if (!marble || marble.state === 'destroyed') this.reservedMarbles.delete(marble);
    }
    this.particles = this.particles.filter((particle) => (
      particle.marble && particle.marble.state !== 'destroyed'
    ));
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
