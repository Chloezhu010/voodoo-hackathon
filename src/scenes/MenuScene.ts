import { CONFIG, UI } from '../config/constants.js';
import { addBubbleButton, addOutlinedText, drawSkyBackground } from '../ui/casualStyle.js';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create(): void {
    drawSkyBackground(this);
    this._drawDecor();

    addOutlinedText(this, CONFIG.GAME_WIDTH / 2, 210, 'MARBLE', {
      fontSize: '78px',
      stroke: '#3f5d96',
      strokeThickness: 9,
      shadowY: 6,
    });
    addOutlinedText(this, CONFIG.GAME_WIDTH / 2, 286, 'SORT!', {
      fontSize: '86px',
      color: '#ffe34a',
      stroke: '#d56d11',
      strokeThickness: 9,
      shadowY: 6,
      shadowColor: '#9f5510',
    });

    const playButton = addBubbleButton(this, CONFIG.GAME_WIDTH / 2, 600, 430, 112, 'PLAY', {
      fill: UI.ACCENT,
      dark: UI.ACCENT_DARK,
      fontSize: '44px',
      textStroke: '#b55a10',
    });
    playButton.on('pointerup', () => this.scene.start('LevelSelectScene'));

    const editorButton = addBubbleButton(this, CONFIG.GAME_WIDTH / 2, 740, 400, 86, 'LEVEL EDITOR', {
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

  private _drawDecor(): void {
    const g = this.add.graphics();
    g.setDepth(-20);

    ([
      [132, 430, 0xff9f1a, 32],
      [202, 488, 0xffe424, 22],
      [552, 430, 0x18d757, 30],
      [494, 500, 0x315df4, 24],
      [146, 872, 0xff5aa7, 26],
      [584, 898, 0xa66bf0, 34],
    ] as const).forEach(([x, y, color, radius]) => {
      g.fillStyle(0x3c5b92, 0.24);
      g.fillCircle(x + 5, y + 7, radius);
      g.fillStyle(color, 1);
      g.fillCircle(x, y, radius);
      g.fillStyle(0xffffff, 0.42);
      g.fillCircle(x - radius * 0.32, y - radius * 0.34, radius * 0.28);
    });
  }
}
