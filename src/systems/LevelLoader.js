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
    if (!Array.isArray(levelData.trays)) throw new Error('Level trays must be an array.');
    if (!Number.isFinite(levelData.queue_capacity)) {
      throw new Error('Level queue_capacity must be a number.');
    }
    return levelData;
  }
}
