import type { BlockRecord } from './types.js';

export type CoverageInput = Pick<BlockRecord, 'id' | 'col' | 'row' | 'z' | 'isCleared'>;

/**
 * A block is "covered" when another not-cleared block sits on the same (col,row)
 * with a strictly greater z. Only the topmost active block in a stack is uncovered.
 */
export function computeCoverage(blocks: readonly CoverageInput[]): Map<string, boolean> {
  const stacks = new Map<string, CoverageInput[]>();
  const coverage = new Map<string, boolean>();

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

export function isBoardCleared(blocks: readonly { isCleared?: boolean }[]): boolean {
  return blocks.every((block) => block.isCleared);
}
