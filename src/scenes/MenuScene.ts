import { ART_KEYS, hasArtTexture } from '../assets/artAssets.js';
import { CONFIG, UI } from '../config/constants.js';
import { addBubbleButton, addOutlinedText, drawSkyBackground } from '../ui/casualStyle.js';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create(): void {
    this._drawHomeBackground();

    const playButton = addBubbleButton(this, CONFIG.GAME_WIDTH / 2, 590, 430, 112, 'PLAY', {
      fill: UI.ACCENT,
      dark: UI.ACCENT_DARK,
      fontSize: '44px',
      textStroke: '#b55a10',
    });
    playButton.on('pointerup', () => this.scene.start('LevelSelectScene'));

    const editorButton = addBubbleButton(this, CONFIG.GAME_WIDTH / 2, 730, 400, 86, 'LEVEL EDITOR', {
      fill: UI.PRIMARY,
      dark: UI.PRIMARY_DARK,
      fontSize: '29px',
    });
    editorButton.on('pointerup', () => this.scene.start('EditorScene'));

    addOutlinedText(this, CONFIG.GAME_WIDTH / 2, 1192, 'VOODOO JAM 2026', {
      fontSize: '22px',
      color: '#d7e8ff',
      stroke: '#4c6ca4',
      strokeThickness: 4,
      shadowY: 2,
    });
  }

  private _drawHomeBackground(): void {
    drawSkyBackground(this);
    if (!hasArtTexture(this, ART_KEYS.homeBackground)) return;

    const bg = this.add.image(CONFIG.GAME_WIDTH / 2, CONFIG.GAME_HEIGHT / 2, ART_KEYS.homeBackground);
    const scale = Math.max(CONFIG.GAME_WIDTH / bg.width, CONFIG.GAME_HEIGHT / bg.height);
    bg.setScale(scale).setDepth(-99);
  }
}
