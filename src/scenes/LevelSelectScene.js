import { CONFIG, UI } from '../config/constants.js';
import { attachHitZone, makeWorldHitZone } from '../ui/hitZones.js';

const LEVELS = [
  {
    id: 1,
    number: '01',
    name: 'Tutorial',
    difficulty: 'Easy',
    stars: '★☆☆',
    hook: 'Learn the basics'
  },
  {
    id: 2,
    number: '02',
    name: 'Hidden Layers',
    difficulty: 'Medium',
    stars: '★★☆',
    hook: "Reveal what's beneath"
  },
  {
    id: 3,
    number: '03',
    name: 'Gravity Flip',
    difficulty: 'Hard',
    stars: '★★★',
    hook: 'Twist the world'
  }
];

export default class LevelSelectScene extends Phaser.Scene {
  constructor() {
    super('LevelSelectScene');
  }

  create() {
    this.cameras.main.setBackgroundColor('#1a1a2e');

    const back = this.add.text(50, 50, '←', {
      fontSize: '48px',
      color: UI.TEXT,
      fontStyle: 'bold'
    }).setOrigin(0.5);
    makeWorldHitZone(this, 50, 50, 80, 80, () => this.scene.start('MenuScene'), { depth: 10 });

    this.add.text(CONFIG.GAME_WIDTH / 2, 160, 'SELECT LEVEL', {
      fontSize: '48px',
      color: UI.TEXT,
      fontStyle: 'bold'
    }).setOrigin(0.5);

    [380, 620, 860].forEach((y, index) => {
      this._makeLevelCard(CONFIG.GAME_WIDTH / 2, y, LEVELS[index]);
    });
  }

  _makeLevelCard(x, y, level) {
    const width = 560;
    const height = 200;
    const container = this.add.container(x, y);

    const background = this.add.graphics();
    background.fillStyle(UI.PANEL, 1);
    background.fillRoundedRect(-width / 2, -height / 2, width, height, 18);
    background.lineStyle(3, 0xffffff, 0.12);
    background.strokeRoundedRect(-width / 2, -height / 2, width, height, 18);

    const number = this.add.text(-200, 0, level.number, {
      fontSize: '64px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    const title = this.add.text(-95, -48, level.name, {
      fontSize: '34px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0, 0.5);

    const stars = this.add.text(-95, 3, level.stars, {
      fontSize: '30px',
      color: '#ffd86b',
      fontStyle: 'bold'
    }).setOrigin(0, 0.5);

    const hook = this.add.text(-95, 48, `${level.difficulty} · ${level.hook}`, {
      fontSize: '22px',
      color: UI.MUTED_TEXT,
      fontStyle: 'bold'
    }).setOrigin(0, 0.5);

    container.add([background, number, title, stars, hook]);
    container.setSize(width, height);
    attachHitZone(this, container, width, height);

    container.on('pointerover', () => {
      this.tweens.add({ targets: container, scale: 1.03, duration: 120, ease: 'Quad.easeOut' });
    });
    container.on('pointerout', () => {
      this.tweens.add({ targets: container, scale: 1, duration: 120, ease: 'Quad.easeOut' });
    });
    container.on('pointerdown', () => {
      this.tweens.add({ targets: container, scale: 0.97, duration: 80, ease: 'Quad.easeOut' });
    });
    container.on('pointerup', () => {
      console.log(`Starting level ${level.id}`);
      this.scene.start('GameScene', { levelId: level.id });
    });
  }
}
