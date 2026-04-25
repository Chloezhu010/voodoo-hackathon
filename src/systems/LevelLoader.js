// Phaser-side compatibility shim. Pure validation lives in src/sim/levelLoader.js.
import {
  validateLevel,
  levelCacheKey,
  levelPathFor,
  padLevelId,
} from '../sim/levelLoader.js';

export { padLevelId };

export class LevelLoader {
  static cacheKey(levelId) {
    return levelCacheKey(levelId);
  }

  static pathFor(levelId) {
    return levelPathFor(levelId);
  }

  static validate(levelData) {
    return validateLevel(levelData);
  }
}

export default LevelLoader;
