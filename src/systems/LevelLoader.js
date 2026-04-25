import { COLOR_IDS } from '../config/colors.js';
import { CONFIG } from '../config/constants.js';

export function padLevelId(levelId) {
  return String(levelId).padStart(2, '0');
}

export default class LevelLoader {
  static cacheKey(levelId) {
    return levelId === 0 ? 'level-test' : `level-${padLevelId(levelId)}`;
  }

  static pathFor(levelId) {
    return levelId === 0
      ? 'src/levels/level_test.json'
      : `src/levels/level_${padLevelId(levelId)}.json`;
  }

  static validate(levelData) {
    if (!levelData) throw new Error('Level data is missing.');
    if (!levelData.board_size) throw new Error('Level board_size is missing.');
    if (!Array.isArray(levelData.blocks)) throw new Error('Level blocks must be an array.');
    if (!Array.isArray(levelData.box_columns)) throw new Error('Level box_columns must be an array.');
    if (levelData.box_columns.length !== 4) {
      throw new Error(`Must have exactly 4 box columns, got ${levelData.box_columns.length}.`);
    }
    if (
      levelData.conveyor_speed !== undefined &&
      (!Number.isFinite(levelData.conveyor_speed) || levelData.conveyor_speed <= 0)
    ) {
      throw new Error('Level conveyor_speed must be a positive number.');
    }

    const blockColors = new Map();
    levelData.blocks.forEach((block, index) => {
      if (!block.id) throw new Error(`Block ${index} missing id.`);
      if (!COLOR_IDS.includes(block.color)) throw new Error(`Unknown block color ${block.color}.`);
      blockColors.set(block.color, (blockColors.get(block.color) || 0) + 1);
    });

    const seenColumns = new Set();
    const boxColors = new Map();
    let boxCount = 0;
    levelData.box_columns.forEach((column) => {
      if (!Number.isInteger(column.col) || column.col < 0 || column.col > 3) {
        throw new Error(`Invalid box column ${column.col}.`);
      }
      if (seenColumns.has(column.col)) throw new Error(`Duplicate box column ${column.col}.`);
      seenColumns.add(column.col);
      if (!Array.isArray(column.boxes)) throw new Error(`Column ${column.col} boxes must be an array.`);
      column.boxes.forEach((color) => {
        if (!COLOR_IDS.includes(color)) throw new Error(`Unknown box color ${color}.`);
        boxColors.set(color, (boxColors.get(color) || 0) + 1);
        boxCount += 1;
      });
    });

    const totalMarbles = levelData.blocks.length * CONFIG.MARBLES_PER_BLOCK;
    const totalBoxCapacity = boxCount * CONFIG.BOX_COLUMNS.BOX_CAPACITY;
    if (totalMarbles !== totalBoxCapacity) {
      throw new Error(`Marble count (${totalMarbles}) != box capacity (${totalBoxCapacity}).`);
    }

    const allColors = new Set([...blockColors.keys(), ...boxColors.keys()]);
    for (const color of allColors) {
      const marbleCount = (blockColors.get(color) || 0) * CONFIG.MARBLES_PER_BLOCK;
      const slotCount = (boxColors.get(color) || 0) * CONFIG.BOX_COLUMNS.BOX_CAPACITY;
      if (marbleCount !== slotCount) {
        throw new Error(`Color ${color}: ${marbleCount} marbles vs ${slotCount} slots.`);
      }
    }
    return levelData;
  }
}
