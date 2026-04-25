import { CONFIG, UI } from '../config/constants.js';
import { addBubbleButton, addOutlinedText, drawBubblePanel, drawSkyBackground } from '../ui/casualStyle.js';

interface GameOverSceneData {
  result?: 'win' | 'lose';
  levelId?: number;
  fromEditor?: boolean;
}

export class GameOverScene extends Phaser.Scene {
  private result: 'win' | 'lose' = 'lose';
  private levelId = 1;
  private fromEditor = false;

  constructor() {
    super('GameOverScene');
  }

  init(data: GameOverSceneData = {}): void {
    this.result = data.result ?? 'lose';
    this.levelId = data.levelId ?? 1;
    this.fromEditor = Boolean(data.fromEditor);
  }

  create(): void {
    drawSkyBackground(this);

    const panel = this.add.graphics();
    drawBubblePanel(panel, 72, 334, 576, 548, 40, {
      fill: 0xf1fbff,
      stroke: UI.BLUE_STROKE,
      strokeWidth: 7,
      shadowOffset: 12,
      highlightAlpha: 0.4,
    });

    const isWin = this.result === 'win';
    this._drawBadge(isWin);

    addOutlinedText(this, CONFIG.GAME_WIDTH / 2, 492, isWin ? 'LEVEL CLEAR!' : 'OUT OF SPACE!', {
      fontSize: isWin ? '48px' : '44px',
      color: isWin ? '#ffe34a' : '#ff8ca9',
      stroke: isWin ? '#d56d11' : '#a84170',
      strokeThickness: 7,
      shadowY: 4,
      shadowColor: isWin ? '#9f5510' : '#77315a',
    });

    this.add.text(CONFIG.GAME_WIDTH / 2, 558, isWin ? 'Boxes cleared' : 'The conveyor is full', {
      fontSize: '26px',
      color: UI.DARK_TEXT,
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const primaryLabel = this.fromEditor ? 'BACK TO EDITOR' : 'RETRY';
    const primaryButton = addBubbleButton(this, CONFIG.GAME_WIDTH / 2, 666, 390, 92, primaryLabel, {
      fill: UI.ACCENT,
      dark: UI.ACCENT_DARK,
      textStroke: '#b55a10',
      fontSize: primaryLabel.length > 8 ? '28px' : '36px',
    });
    primaryButton.on('pointerup', () => {
      if (this.fromEditor) {
        this.scene.start('EditorScene');
      } else {
        this.scene.start('GameScene', { levelId: this.levelId });
      }
    });

    const menuButton = addBubbleButton(this, CONFIG.GAME_WIDTH / 2, 780, 390, 82, 'MENU', {
      fill: UI.PRIMARY,
      dark: UI.PRIMARY_DARK,
      fontSize: '30px',
    });
    menuButton.on('pointerup', () => {
      this.scene.start(this.fromEditor ? 'EditorScene' : 'LevelSelectScene');
    });
  }

  private _drawBadge(isWin: boolean): void {
    const g = this.add.graphics();
    const cx = CONFIG.GAME_WIDTH / 2;
    const y = 410;
    const color = isWin ? UI.ACCENT : 0xff6f9f;
    const dark = isWin ? UI.ACCENT_DARK : 0xb83d70;
    g.fillStyle(dark, 1);
    g.fillCircle(cx, y + 8, 64);
    g.fillStyle(color, 1);
    g.fillCircle(cx, y, 64);
    g.fillStyle(0xffffff, 0.28);
    g.fillCircle(cx - 20, y - 22, 20);
    g.lineStyle(6, 0xffffff, 0.46);
    g.strokeCircle(cx, y, 64);

    addOutlinedText(this, cx, y - 1, isWin ? '!' : 'X', {
      fontSize: '64px',
      stroke: isWin ? '#b55a10' : '#8b2854',
      strokeThickness: 6,
      shadowY: 3,
      shadowColor: isWin ? '#9f5510' : '#77315a',
    });
  }
}
