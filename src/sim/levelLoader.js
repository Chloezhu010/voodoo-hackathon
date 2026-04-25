import { COLOR_IDS } from '../config/colors.js';
import { CONFIG } from '../config/constants.js';

export function padLevelId(levelId) {
  return String(levelId).padStart(2, '0');
}

export function levelCacheKey(levelId) {
  return levelId === 0 ? 'level-test' : `level-${padLevelId(levelId)}`;
}

export function levelPathFor(levelId) {
  return levelId === 0
    ? 'src/levels/level_test.json'
    : `src/levels/level_${padLevelId(levelId)}.json`;
}

function assertBoxColumns(levelData) {
  if (!Array.isArray(levelData.box_columns)) throw new Error('Level box_columns must be an array.');
  if (levelData.box_columns.length !== 4) {
    throw new Error(`Must have exactly 4 box columns, got ${levelData.box_columns.length}.`);
  }
}

function assertConveyorSpeed(levelData) {
  if (levelData.conveyor_speed === undefined) return;
  if (!Number.isFinite(levelData.conveyor_speed) || levelData.conveyor_speed <= 0) {
    throw new Error('Level conveyor_speed must be a positive number.');
  }
}

function tallyBlocks(blocks) {
  const counts = new Map();
  blocks.forEach((block, index) => {
    if (!block.id) throw new Error(`Block ${index} missing id.`);
    if (!COLOR_IDS.includes(block.color)) throw new Error(`Unknown block color ${block.color}.`);
    counts.set(block.color, (counts.get(block.color) || 0) + 1);
  });
  return counts;
}

function tallyBoxColumns(columns) {
  const seenColumns = new Set();
  const counts = new Map();
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
      counts.set(color, (counts.get(color) || 0) + 1);
      total += 1;
    });
  });
  return { counts, total };
}

function assertColorBalance(blockColors, boxColors) {
  const allColors = new Set([...blockColors.keys(), ...boxColors.keys()]);
  for (const color of allColors) {
    const marbleCount = (blockColors.get(color) || 0) * CONFIG.MARBLES_PER_BLOCK;
    const slotCount = (boxColors.get(color) || 0) * CONFIG.BOX_COLUMNS.BOX_CAPACITY;
    if (marbleCount !== slotCount) {
      throw new Error(`Color ${color}: ${marbleCount} marbles vs ${slotCount} slots.`);
    }
  }
}

/**
 * Pure validation. Throws on invalid data, returns the same object on success.
 */
export function validateLevel(levelData) {
  if (!levelData) throw new Error('Level data is missing.');
  if (!levelData.board_size) throw new Error('Level board_size is missing.');
  if (!Array.isArray(levelData.blocks)) throw new Error('Level blocks must be an array.');
  assertBoxColumns(levelData);
  assertConveyorSpeed(levelData);

  const blockColors = tallyBlocks(levelData.blocks);
  const { counts: boxColors, total: boxCount } = tallyBoxColumns(levelData.box_columns);

  const totalMarbles = levelData.blocks.length * CONFIG.MARBLES_PER_BLOCK;
  const totalBoxCapacity = boxCount * CONFIG.BOX_COLUMNS.BOX_CAPACITY;
  if (totalMarbles !== totalBoxCapacity) {
    throw new Error(`Marble count (${totalMarbles}) != box capacity (${totalBoxCapacity}).`);
  }

  assertColorBalance(blockColors, boxColors);
  return levelData;
}
