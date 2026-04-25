/**
 * Pure coverage computation for the block board.
 *
 * A block is "covered" when another not-cleared block sits on the same (col,row)
 * with a strictly greater z. Only the topmost active block in a stack is uncovered
 * and therefore tappable.
 *
 * @typedef {{ id: string, col: number, row: number, z: number, isCleared?: boolean }} BlockLike
 */

/**
 * Returns a Map<blockId, boolean> where `true` means covered.
 * Pure: does not mutate inputs, does not touch any global.
 *
 * @param {readonly BlockLike[]} blocks
 * @returns {Map<string, boolean>}
 */
export function computeCoverage(blocks) {
  const stacks = new Map();
  const coverage = new Map();

  for (const block of blocks) {
    if (block.isCleared) continue;
    const key = `${block.col}:${block.row}`;
    const stack = stacks.get(key);
    if (stack) stack.push(block);
    else stacks.set(key, [block]);
    coverage.set(block.id, false);
  }

  for (const stack of stacks.values()) {
    const sorted = [...stack].sort((a, b) => b.z - a.z);
    sorted.forEach((block, index) => coverage.set(block.id, index !== 0));
  }

  return coverage;
}

/**
 * @param {readonly BlockLike[]} blocks
 * @returns {boolean}
 */
export function isBoardCleared(blocks) {
  return blocks.every((block) => block.isCleared);
}
