export default class BoardManager {
  constructor(blocks) {
    this.blocks = blocks;
    this.recomputeCoverage();
  }

  recomputeCoverage() {
    const cells = new Map();
    const coverage = new Map();

    this.blocks
      .filter((block) => !block.isCleared)
      .forEach((block) => {
        const key = `${block.data.col}:${block.data.row}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(block);
        coverage.set(block, false);
      });

    cells.forEach((stack) => {
      const sorted = [...stack].sort((a, b) => b.data.z - a.data.z);
      sorted.forEach((block, index) => {
        coverage.set(block, index !== 0);
      });
    });

    this.blocks.forEach((block) => {
      if (!block.isCleared) block.setCovered(Boolean(coverage.get(block)));
    });

    this.blocks.forEach((block) => block.refreshInteractivity?.());
  }

  onBlockCleared(block) {
    block.isCleared = true;
    this.recomputeCoverage();
  }

  isLevelComplete() {
    return this.blocks.every((block) => block.isCleared);
  }
}
