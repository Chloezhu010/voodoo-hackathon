import { CONFIG, UI } from './config/constants.js';
import { BootScene } from './scenes/BootScene.js';
import { EditorScene } from './scenes/EditorScene.js';
import { GameOverScene } from './scenes/GameOverScene.js';
import { GameScene } from './scenes/GameScene.js';
import { LevelSelectScene } from './scenes/LevelSelectScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { colorToCss } from './ui/casualStyle.js';

declare global {
  interface Window {
    marbleSortGame?: Phaser.Game;
  }
}

const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: CONFIG.GAME_WIDTH,
  height: CONFIG.GAME_HEIGHT,
  parent: 'game-container',
  backgroundColor: colorToCss(UI.BACKGROUND),
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 600 }, debug: false },
  },
  scene: [BootScene, MenuScene, LevelSelectScene, GameScene, GameOverScene, EditorScene],
};

window.addEventListener('load', () => {
  window.marbleSortGame = new Phaser.Game(gameConfig);
});
