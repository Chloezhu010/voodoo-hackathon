import { computeCoverage, isBoardCleared } from '../sim/coverage.js';
import type { BlockRecord } from '../sim/types.js';

/**
 * Minimal Block-entity contract this manager needs. Kept structural so the
 * concrete Phaser entity can stay decoupled until its own TS migration.
 */
export interface BlockLike {
  data: Pick<BlockRecord, 'id' | 'col' | 'row' | 'z'>;
  isCleared: boolean;
  setCovered(isCovered: boolean): void;
  refreshInteractivity?(): unknown;
}

/**
 * Phaser-side adapter. Pure coverage logic lives in `src/sim/coverage.ts`.
 */
export class BoardManager {
  readonly blocks: BlockLike[];

  constructor(blocks: BlockLike[]) {
    this.blocks = blocks;
    this.recomputeCoverage();
  }

  recomputeCoverage(): void {
    const records = this.blocks.map((block) => ({
      id: block.data.id,
      col: block.data.col,
      row: block.data.row,
      z: block.data.z,
      isCleared: block.isCleared,
    }));
    const coverage = computeCoverage(records);

    for (const block of this.blocks) {
      if (block.isCleared) continue;
      block.setCovered(Boolean(coverage.get(block.data.id)));
    }
    for (const block of this.blocks) block.refreshInteractivity?.();
  }

  onBlockCleared(block: BlockLike): void {
    block.isCleared = true;
    this.recomputeCoverage();
  }

  isLevelComplete(): boolean {
    return isBoardCleared(
      this.blocks.map((block) => ({ id: block.data.id, isCleared: block.isCleared })),
    );
  }
}
