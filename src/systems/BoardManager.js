import { computeCoverage, isBoardCleared } from '../sim/coverage.js';

/**
 * Phaser-side adapter. Pure coverage logic lives in `src/sim/coverage.js`.
 * This wrapper translates between Block entities (with render hooks) and the
 * pure block records the sim layer expects.
 */
export class BoardManager {
  constructor(blocks) {
    this.blocks = blocks;
    this.recomputeCoverage();
  }

  recomputeCoverage() {
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

  onBlockCleared(block) {
    block.isCleared = true;
    this.recomputeCoverage();
  }

  isLevelComplete() {
    return isBoardCleared(
      this.blocks.map((block) => ({ id: block.data.id, isCleared: block.isCleared })),
    );
  }
}

export default BoardManager;
