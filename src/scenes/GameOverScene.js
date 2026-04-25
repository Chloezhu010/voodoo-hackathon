import { CONFIG, UI } from '../config/constants.js';
import { attachHitZone } from '../ui/hitZones.js';

export default class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOverScene');
  }

  init(data = {}) {
    this.result = data.result || 'lose';
    this.levelId = data.levelId || 1;
    this.fromEditor = Boolean(data.fromEditor);
  }

  create() {
    this.cameras.main.setBackgroundColor('#1a1a2e');

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.72);
    overlay.fillRect(0, 0, CONFIG.GAME_WIDTH, CONFIG.GAME_HEIGHT);

    const panel = this.add.graphics();
    panel.fillStyle(UI.PANEL, 1);
    panel.fillRoundedRect(80, 350, 560, 520, 28);
    panel.lineStyle(3, 0xffffff, 0.14);
    panel.strokeRoundedRect(80, 350, 560, 520, 28);

    const isWin = this.result === 'win';
    this.add.text(CONFIG.GAME_WIDTH / 2, 470, isWin ? 'LEVEL CLEAR!' : 'OUT OF SPACE!', {
      fontSize: '46px',
      color: isWin ? '#ffd86b' : '#ff9a9a',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    this.add.text(
      CONFIG.GAME_WIDTH / 2,
      540,
      isWin ? 'Trays complete' : 'The queue is full',
      {
        fontSize: '24px',
        color: UI.MUTED_TEXT,
        fontStyle: 'bold'
      }
    ).setOrigin(0.5);

    const primaryLabel = this.fromEditor ? 'BACK TO EDITOR' : 'RETRY';
    const primaryButton = this._makeButton(CONFIG.GAME_WIDTH / 2, 650, 360, 86, primaryLabel, UI.PRIMARY);
    primaryButton.on('pointerup', () => {
      if (this.fromEditor) {
        this.scene.start('EditorScene');
      } else {
        this.scene.start('GameScene', { levelId: this.levelId });
      }
    });

    const menuButton = this._makeButton(CONFIG.GAME_WIDTH / 2, 760, 360, 76, 'MENU', UI.PANEL_DARK);
    menuButton.on('pointerup', () => {
      this.scene.start(this.fromEditor ? 'EditorScene' : 'LevelSelectScene');
    });
  }

  _makeButton(x, y, width, height, label, fillColor) {
    const container = this.add.container(x, y);
    const bg = this.add.graphics();
    bg.fillStyle(fillColor, 1);
    bg.fillRoundedRect(-width / 2, -height / 2, width, height, 20);
    bg.lineStyle(2, 0xffffff, 0.16);
    bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 20);

    const text = this.add.text(0, 0, label, {
      fontSize: label.length > 8 ? '26px' : '30px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    container.add([bg, text]);
    container.setSize(width, height);
    attachHitZone(this, container, width, height);
    container.on('pointerover', () => this.tweens.add({ targets: container, scale: 1.04, duration: 100 }));
    container.on('pointerout', () => this.tweens.add({ targets: container, scale: 1, duration: 100 }));
    container.on('pointerdown', () => this.tweens.add({ targets: container, scale: 0.96, duration: 70 }));

    return container;
  }
}
