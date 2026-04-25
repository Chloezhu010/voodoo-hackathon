import { CONFIG, UI } from '../config/constants.js';
import { attachHitZone } from '../ui/hitZones.js';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a1a2e');

    this.add.text(CONFIG.GAME_WIDTH / 2, 200, 'Marble Sort!', {
      fontSize: '72px',
      color: UI.TEXT,
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(CONFIG.GAME_WIDTH / 2, 290, 'Tap. Match. Sort.', {
      fontSize: '28px',
      color: UI.MUTED_TEXT,
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const playButton = this._makeButton(CONFIG.GAME_WIDTH / 2, 600, 400, 100, 'PLAY', UI.PRIMARY, 0xffffff);
    playButton.on('pointerup', () => this.scene.start('LevelSelectScene'));

    const editorButton = this._makeButton(CONFIG.GAME_WIDTH / 2, 740, 400, 80, 'LEVEL EDITOR', UI.PANEL, 0xffffff);
    editorButton.on('pointerup', () => this.scene.start('EditorScene'));

    this.add.text(CONFIG.GAME_WIDTH / 2, 1200, 'Made for Voodoo Game Jam 2026', {
      fontSize: '20px',
      color: UI.MUTED_TEXT,
      fontStyle: 'bold',
    }).setOrigin(0.5);
  }

  private _makeButton(
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    fillColor: number,
    textColor: number,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    const background = this.add.graphics();
    background.fillStyle(fillColor, 1);
    background.fillRoundedRect(-width / 2, -height / 2, width, height, 24);
    background.lineStyle(2, 0xffffff, fillColor === UI.PRIMARY ? 0.15 : 0.25);
    background.strokeRoundedRect(-width / 2, -height / 2, width, height, 24);

    const text = this.add.text(0, 0, label, {
      fontSize: height >= 100 ? '38px' : '30px',
      color: `#${textColor.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold',
    }).setOrigin(0.5);

    container.add([background, text]);
    container.setSize(width, height);
    attachHitZone(this, container, width, height);

    container.on('pointerover', () => {
      this.tweens.add({ targets: container, scale: 1.05, duration: 120, ease: 'Quad.easeOut' });
    });
    container.on('pointerout', () => {
      this.tweens.add({ targets: container, scale: 1, duration: 120, ease: 'Quad.easeOut' });
    });
    container.on('pointerdown', () => {
      this.tweens.add({ targets: container, scale: 0.95, duration: 80, ease: 'Quad.easeOut' });
    });
    container.on('pointerup', () => {
      this.tweens.add({ targets: container, scale: 1.05, duration: 80, ease: 'Quad.easeOut' });
    });

    return container;
  }
}
