import { CONFIG, UI } from '../config/constants.js';
import { addBubbleButton, addOutlinedText, drawBubblePanel, drawSkyBackground } from '../ui/casualStyle.js';

interface GameOverSceneData {
  result?: 'win' | 'lose';
  levelId?: number;
  fromEditor?: boolean;
}

interface SparkleOptions {
  x: number;
  y: number;
  radius: number;
  color: number;
  alpha: number;
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
    this._drawResultBadge(isWin);

    addOutlinedText(this, CONFIG.GAME_WIDTH / 2, 548, isWin ? 'LEVEL CLEAR!' : 'LEVEL FAILED', {
      fontSize: isWin ? '46px' : '42px',
      color: isWin ? '#ffe34a' : '#ff8ca9',
      stroke: isWin ? '#d56d11' : '#a84170',
      strokeThickness: 7,
      shadowY: 4,
      shadowColor: isWin ? '#9f5510' : '#77315a',
    });

    this.add.text(CONFIG.GAME_WIDTH / 2, 608, isWin ? 'Boxes cleared' : 'The conveyor is full', {
      fontSize: '26px',
      color: UI.DARK_TEXT,
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this._addActionButtons();
  }

  private _addActionButtons(): void {
    const primaryLabel = this.fromEditor ? 'BACK TO EDITOR' : 'RETRY';
    const primaryButton = addBubbleButton(this, CONFIG.GAME_WIDTH / 2, 710, 390, 92, primaryLabel, {
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

    const menuButton = addBubbleButton(this, CONFIG.GAME_WIDTH / 2, 816, 390, 82, 'MENU', {
      fill: UI.PRIMARY,
      dark: UI.PRIMARY_DARK,
      fontSize: '30px',
    });
    menuButton.on('pointerup', () => {
      this.scene.start(this.fromEditor ? 'EditorScene' : 'LevelSelectScene');
    });
  }

  private _drawResultBadge(isWin: boolean): void {
    const g = this.add.graphics();
    const cx = CONFIG.GAME_WIDTH / 2;
    const y = 416;
    const color = isWin ? UI.ACCENT : 0xff6b6b;
    const dark = isWin ? UI.ACCENT_DARK : 0x9d2f48;
    g.fillStyle(dark, 1);
    g.fillCircle(cx, y + 8, 64);
    g.fillStyle(color, 1);
    g.fillCircle(cx, y, 64);
    g.fillStyle(0xffffff, 0.28);
    g.fillCircle(cx - 20, y - 22, 20);
    g.lineStyle(6, 0xffffff, 0.46);
    g.strokeCircle(cx, y, 64);

    if (isWin) {
      this._drawClearIcon(g, cx, y);
    } else {
      this._drawFailIcon(g, cx, y);
    }
  }

  private _drawClearIcon(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
    const starPoints = this._starPoints(cx, cy + 2, 38, 18, 5);
    g.lineStyle(8, 0xb55a10, 0.55);
    g.strokePoints(starPoints, true);
    g.fillStyle(0xffffff, 1);
    g.fillPoints(starPoints, true);
    g.fillStyle(0xfff2a0, 1);
    g.fillPoints(this._starPoints(cx - 5, cy - 3, 25, 11, 5), true);

    this._drawSparkle(g, { x: cx - 46, y: cy - 30, radius: 10, color: 0xffffff, alpha: 0.82 });
    this._drawSparkle(g, { x: cx + 46, y: cy - 22, radius: 12, color: 0xffffff, alpha: 0.9 });
    this._drawSparkle(g, { x: cx + 34, y: cy + 38, radius: 8, color: 0xffffff, alpha: 0.72 });
  }

  private _drawFailIcon(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
    g.fillStyle(0x7b273c, 0.55);
    g.fillRoundedRect(cx - 42, cy - 25, 84, 50, 14);
    g.fillStyle(0xffd8c7, 1);
    g.fillRoundedRect(cx - 34, cy - 16, 68, 32, 10);
    g.fillStyle(0xff8c45, 1);
    g.fillCircle(cx - 20, cy, 10);
    g.fillStyle(0xffd236, 1);
    g.fillCircle(cx, cy, 10);
    g.fillStyle(0x7bd978, 1);
    g.fillCircle(cx + 20, cy, 10);
    g.lineStyle(11, 0xffffff, 0.95);
    g.beginPath();
    g.moveTo(cx - 34, cy + 34);
    g.lineTo(cx + 34, cy - 34);
    g.strokePath();
    g.lineStyle(6, 0x8d2943, 0.72);
    g.beginPath();
    g.moveTo(cx - 31, cy + 31);
    g.lineTo(cx + 31, cy - 31);
    g.strokePath();
  }

  private _starPoints(cx: number, cy: number, outerRadius: number, innerRadius: number, points: number): Phaser.Geom.Point[] {
    const result: Phaser.Geom.Point[] = [];
    const step = Math.PI / points;
    for (let i = 0; i < points * 2; i += 1) {
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const angle = -Math.PI / 2 + i * step;
      result.push(new Phaser.Geom.Point(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius));
    }
    return result;
  }

  private _drawSparkle(g: Phaser.GameObjects.Graphics, options: SparkleOptions): void {
    const { x: cx, y: cy, radius, color, alpha } = options;
    const points = [
      new Phaser.Geom.Point(cx, cy - radius),
      new Phaser.Geom.Point(cx + radius * 0.28, cy - radius * 0.28),
      new Phaser.Geom.Point(cx + radius, cy),
      new Phaser.Geom.Point(cx + radius * 0.28, cy + radius * 0.28),
      new Phaser.Geom.Point(cx, cy + radius),
      new Phaser.Geom.Point(cx - radius * 0.28, cy + radius * 0.28),
      new Phaser.Geom.Point(cx - radius, cy),
      new Phaser.Geom.Point(cx - radius * 0.28, cy - radius * 0.28),
    ];
    g.fillStyle(color, alpha);
    g.fillPoints(points, true);
  }
}
