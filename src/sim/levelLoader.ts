import { COLOR_IDS } from '../config/colors.js';
import { CONFIG } from '../config/constants.js';

import type { BoxColumn, ColorId, LevelData } from './types.js';

export function padLevelId(levelId: number): string {
  return String(levelId).padStart(2, '0');
}

export function levelCacheKey(levelId: number): string {
  return levelId === 0 ? 'level-test' : `level-${padLevelId(levelId)}`;
}

export function levelPathFor(levelId: number): string {
  return levelId === 0
    ? 'src/levels/level_test.json'
    : `src/levels/level_${padLevelId(levelId)}.json`;
}

function assertBoxColumns(levelData: LevelData): void {
  if (!Array.isArray(levelData.box_columns)) throw new Error('Level box_columns must be an array.');
  if (levelData.box_columns.length !== 4) {
    throw new Error(`Must have exactly 4 box columns, got ${levelData.box_columns.length}.`);
  }
}

function assertConveyorSpeed(levelData: LevelData): void {
  if (levelData.conveyor_speed === undefined) return;
  if (!Number.isFinite(levelData.conveyor_speed) || levelData.conveyor_speed <= 0) {
    throw new Error('Level conveyor_speed must be a positive number.');
  }
}

function tallyBlocks(blocks: LevelData['blocks']): Map<ColorId, number> {
  const counts = new Map<ColorId, number>();
  blocks.forEach((block, index) => {
    if (!block.id) throw new Error(`Block ${index} missing id.`);
    if (!COLOR_IDS.includes(block.color)) throw new Error(`Unknown block color ${block.color}.`);
    counts.set(block.color, (counts.get(block.color) ?? 0) + 1);
  });
  return counts;
}

function assertWalls(levelData: LevelData): void {
  if (levelData.walls === undefined) return;
  if (!Array.isArray(levelData.walls)) throw new Error('Level walls must be an array.');

  const occupiedBlocks = new Set(levelData.blocks.map((block) => `${block.col}:${block.row}`));
  const occupiedWalls = new Set<string>();
  levelData.walls.forEach((wall, index) => {
    if (!Number.isInteger(wall.col) || !Number.isInteger(wall.row)) {
      throw new Error(`Wall ${index} col/row must be integers.`);
    }
    if (
      wall.col < 0
      || wall.col >= levelData.board_size.cols
      || wall.row < 0
      || wall.row >= levelData.board_size.rows
    ) {
      throw new Error(`Wall ${index} is outside board.`);
    }

    const key = `${wall.col}:${wall.row}`;
    if (occupiedWalls.has(key)) throw new Error(`Duplicate wall cell ${key}.`);
    if (occupiedBlocks.has(key)) throw new Error(`Wall ${key} overlaps a block.`);
    occupiedWalls.add(key);
  });
}

function tallyBoxColumns(columns: BoxColumn[]): { counts: Map<ColorId, number>; total: number } {
  const seenColumns = new Set<number>();
  const counts = new Map<ColorId, number>();
  let total = 0;
  columns.forEach((column) => {
    if (!Number.isInteger(column.col) || column.col < 0 || column.col > 3) {
      throw new Error(`Invalid box column ${column.col}.`);
    }
    if (seenColumns.has(column.col)) throw new Error(`Duplicate box column ${column.col}.`);
    seenColumns.add(column.col);
    if (!Array.isArray(column.boxes)) {
      throw new Error(`Column ${column.col} boxes must be an array.`);
    }
    column.boxes.forEach((color) => {
      if (!COLOR_IDS.includes(color)) throw new Error(`Unknown box color ${color}.`);
      counts.set(color, (counts.get(color) ?? 0) + 1);
      total += 1;
    });
  });
  return { counts, total };
}

function assertColorBalance(blockColors: Map<ColorId, number>, boxColors: Map<ColorId, number>): void {
  const allColors = new Set<ColorId>([...blockColors.keys(), ...boxColors.keys()]);
  for (const color of allColors) {
    const marbleCount = (blockColors.get(color) ?? 0) * CONFIG.MARBLES_PER_BLOCK;
    const slotCount = (boxColors.get(color) ?? 0) * CONFIG.BOX_COLUMNS.BOX_CAPACITY;
    if (marbleCount !== slotCount) {
      throw new Error(`Color ${color}: ${marbleCount} marbles vs ${slotCount} slots.`);
    }
  }
}

/** Pure validation. Throws on invalid data, returns the same object on success. */
export function validateLevel(levelData: LevelData | null | undefined): LevelData {
  if (!levelData) throw new Error('Level data is missing.');
  if (!levelData.board_size) throw new Error('Level board_size is missing.');
  if (!Array.isArray(levelData.blocks)) throw new Error('Level blocks must be an array.');
  assertBoxColumns(levelData);
  assertConveyorSpeed(levelData);

  const blockColors = tallyBlocks(levelData.blocks);
  assertWalls(levelData);
  const { counts: boxColors, total: boxCount } = tallyBoxColumns(levelData.box_columns);

  const totalMarbles = levelData.blocks.length * CONFIG.MARBLES_PER_BLOCK;
  const totalBoxCapacity = boxCount * CONFIG.BOX_COLUMNS.BOX_CAPACITY;
  if (totalMarbles !== totalBoxCapacity) {
    throw new Error(`Marble count (${totalMarbles}) != box capacity (${totalBoxCapacity}).`);
  }

  assertColorBalance(blockColors, boxColors);
  return levelData;
}
