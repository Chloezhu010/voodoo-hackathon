import type { BlockRecord, BoardSize, WallCell } from './types.js';

export type CoverageInput = Pick<BlockRecord, 'id' | 'col' | 'row' | 'z' | 'isCleared'>;

export interface CoverageOptions {
  boardSize?: BoardSize;
  walls?: readonly WallCell[];
}

/**
 * A block is "covered" when another not-cleared block sits on the same (col,row)
 * with a strictly greater z, or when the active top block is fully enclosed by
 * walls, board edges, and other active top blocks.
 */
export function computeCoverage(
  blocks: readonly CoverageInput[],
  options: CoverageOptions = {},
): Map<string, boolean> {
  const stacks = new Map<string, CoverageInput[]>();
  const coverage = new Map<string, boolean>();
  const topBlocks: CoverageInput[] = [];

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
    sorted.forEach((block, index) => {
      coverage.set(block.id, index !== 0);
      if (index === 0) topBlocks.push(block);
    });
  }

  if (options.boardSize) {
    const blockers = new Set(topBlocks.map((block) => cellKey(block.col, block.row)));
    const walls = new Set((options.walls ?? []).map((wall) => cellKey(wall.col, wall.row)));
    for (const block of topBlocks) {
      if (isFullyEnclosed(block, options.boardSize, walls, blockers)) {
        coverage.set(block.id, true);
      }
    }
  }

  return coverage;
}

export function isBoardCleared(blocks: readonly { isCleared?: boolean }[]): boolean {
  return blocks.every((block) => block.isCleared);
}

function isFullyEnclosed(
  block: Pick<CoverageInput, 'col' | 'row'>,
  boardSize: BoardSize,
  walls: ReadonlySet<string>,
  blockers: ReadonlySet<string>,
): boolean {
  const directions = [
    { col: -1, row: 0 },
    { col: 1, row: 0 },
    { col: 0, row: -1 },
    { col: 0, row: 1 },
  ] as const;

  return directions.every((direction) => {
    const col = block.col + direction.col;
    const row = block.row + direction.row;
    if (col < 0 || row < 0 || col >= boardSize.cols || row >= boardSize.rows) return true;
    const key = cellKey(col, row);
    return walls.has(key) || blockers.has(key);
  });
}

function cellKey(col: number, row: number): string {
  return `${col}:${row}`;
}
