import { computeCoverage, isBoardCleared } from '../sim/coverage.js';
import type { BlockRecord, BoardSize, WallCell } from '../sim/types.js';

/**
 * Minimal Block-entity contract this manager needs. Kept structural so the
 * concrete Phaser entity can stay decoupled until its own TS migration.
 */
export interface BlockLike {
  data: Pick<BlockRecord, 'id' | 'col' | 'row' | 'z' | 'revealed_by'>;
  isCleared: boolean;
  setCovered(isCovered: boolean): void;
  isConcealed?(): boolean;
  revealConcealed?(): boolean;
  refreshInteractivity?(): unknown;
}

/**
 * Phaser-side adapter. Pure coverage logic lives in `src/sim/coverage.ts`.
 */
export class BoardManager {
  readonly blocks: BlockLike[];
  readonly boardSize: BoardSize;
  readonly walls: readonly WallCell[];

  constructor(blocks: BlockLike[], boardSize: BoardSize = { cols: 5, rows: 5 }, walls: readonly WallCell[] = []) {
    this.blocks = blocks;
    this.boardSize = boardSize;
    this.walls = walls;
    this.recomputeCoverage();
  }

  recomputeCoverage(): void {
    const records = this.blocks.map((block) => ({
      id: block.data.id,
      col: block.data.col,
      row: block.data.row,
      z: block.data.z,
      isCleared: block.isCleared,
      isConcealed: block.isConcealed?.() ?? false,
    }));
    const coverage = computeCoverage(records, {
      boardSize: this.boardSize,
      walls: this.walls,
    });

    for (const block of this.blocks) {
      if (block.isCleared) continue;
      block.setCovered(Boolean(coverage.get(block.data.id)));
    }
    for (const block of this.blocks) block.refreshInteractivity?.();
  }

  onBlockCleared(block: BlockLike): void {
    block.isCleared = true;
    this.blocks.forEach((candidate) => {
      if (candidate.data.revealed_by !== block.data.id) return;
      candidate.revealConcealed?.();
    });
    this.recomputeCoverage();
  }

  isLevelComplete(): boolean {
    return isBoardCleared(
      this.blocks.map((block) => ({ id: block.data.id, isCleared: block.isCleared })),
    );
  }
}
