import BootScene from './scenes/BootScene.js';
import MenuScene from './scenes/MenuScene.js';
import LevelSelectScene from './scenes/LevelSelectScene.js';
import GameScene from './scenes/GameScene.js';
import GameOverScene from './scenes/GameOverScene.js';
import EditorScene from './scenes/EditorScene.js';
import { CONFIG, UI } from './config/constants.js';
import { colorToCss } from './ui/casualStyle.js';

const gameConfig = {
  type: Phaser.AUTO,
  width: CONFIG.GAME_WIDTH,
  height: CONFIG.GAME_HEIGHT,
  parent: 'game-container',
  backgroundColor: colorToCss(UI.BACKGROUND),
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 600 },
      debug: false
    }
  },
  scene: [
    BootScene,
    MenuScene,
    LevelSelectScene,
    GameScene,
    GameOverScene,
    EditorScene
  ]
};

window.addEventListener('load', () => {
  window.marbleSortGame = new Phaser.Game(gameConfig);
});
