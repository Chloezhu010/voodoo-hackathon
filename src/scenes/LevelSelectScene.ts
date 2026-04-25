import { CONFIG, UI } from '../config/constants.js';
import { addBubbleButton, addOutlinedText, drawBubblePanel, drawSkyBackground } from '../ui/casualStyle.js';
import { attachHitZone } from '../ui/hitZones.js';

interface LevelEntry {
  id: number;
  number: string;
  name: string;
  difficulty: string;
  stars: string;
  hook: string;
}

const LEVELS: readonly LevelEntry[] = [
  { id: 1, number: '01', name: 'Tutorial', difficulty: 'Easy', stars: '★☆☆', hook: 'Learn the basics' },
  { id: 2, number: '02', name: 'Hidden Layers', difficulty: 'Medium', stars: '★★☆', hook: "Reveal what's beneath" },
  { id: 3, number: '03', name: 'Gravity Flip', difficulty: 'Hard', stars: '★★★', hook: 'Twist the world' },
];

export class LevelSelectScene extends Phaser.Scene {
  constructor() {
    super('LevelSelectScene');
  }

  create(): void {
    drawSkyBackground(this);

    const back = addBubbleButton(this, 50, 50, 74, 70, '<', {
      fill: UI.PRIMARY,
      dark: UI.PRIMARY_DARK,
      fontSize: '40px',
      radius: 18,
      depth: 20,
    });
    back.on('pointerup', () => this.scene.start('MenuScene'));

    addOutlinedText(this, CONFIG.GAME_WIDTH / 2, 158, 'SELECT LEVEL', {
      fontSize: '50px',
      stroke: '#3f5d96',
      strokeThickness: 7,
      shadowY: 5,
    });

    [380, 620, 860].forEach((y, index) => {
      const level = LEVELS[index];
      if (level) this._makeLevelCard(CONFIG.GAME_WIDTH / 2, y, level);
    });
  }

  private _makeLevelCard(x: number, y: number, level: LevelEntry): void {
    const width = 560;
    const height = 200;
    const container = this.add.container(x, y);

    const background = this.add.graphics();
    drawBubblePanel(background, -width / 2, -height / 2, width, height, 30, {
      fill: 0xe9f5fa,
      stroke: UI.BLUE_STROKE,
      strokeWidth: 5,
      shadowOffset: 9,
      highlightAlpha: 0.36,
    });

    const badge = this.add.graphics();
    badge.fillStyle(UI.PRIMARY_DARK, 1);
    badge.fillRoundedRect(-238, -70, 112, 140, 26);
    badge.fillStyle(UI.PRIMARY, 1);
    badge.fillRoundedRect(-238, -78, 112, 140, 26);
    badge.fillStyle(0xffffff, 0.25);
    badge.fillRoundedRect(-226, -66, 88, 34, 18);
    badge.lineStyle(4, 0xffffff, 0.4);
    badge.strokeRoundedRect(-238, -78, 112, 140, 26);

    const number = addOutlinedText(this, -182, -7, level.number, {
      fontSize: '58px',
      stroke: '#6f3fb3',
      strokeThickness: 6,
      shadowY: 3,
    });

    const title = this.add.text(-95, -52, level.name, {
      fontSize: '34px', color: UI.DARK_TEXT, fontStyle: 'bold',
    }).setOrigin(0, 0.5);

    const stars = this.add.text(-95, 3, level.stars, {
      fontSize: '30px', color: '#ffbe24', fontStyle: 'bold',
    }).setOrigin(0, 0.5);

    const hook = this.add.text(-95, 48, level.difficulty.toUpperCase(), {
      fontSize: '22px', color: UI.MUTED_TEXT, fontStyle: 'bold',
    }).setOrigin(0, 0.5);

    const arrow = addOutlinedText(this, 226, 0, '>', {
      fontSize: '40px',
      stroke: '#d46e10',
      strokeThickness: 5,
      color: '#ffffff',
      shadowY: 2,
      shadowColor: '#a5520d',
    });
    const arrowBg = this.add.graphics();
    arrowBg.fillStyle(UI.ACCENT_DARK, 1);
    arrowBg.fillRoundedRect(190, -36, 72, 72, 20);
    arrowBg.fillStyle(UI.ACCENT, 1);
    arrowBg.fillRoundedRect(190, -43, 72, 72, 20);
    arrowBg.fillStyle(0xffffff, 0.22);
    arrowBg.fillRoundedRect(198, -35, 56, 20, 10);

    container.add([background, badge, number, title, stars, hook, arrowBg, arrow]);
    container.setSize(width, height);
    attachHitZone(this, container, width, height);

    container.on('pointerover', () => {
      this.tweens.add({ targets: container, scale: 1.035, duration: 120, ease: 'Back.easeOut' });
    });
    container.on('pointerout', () => {
      this.tweens.add({ targets: container, scale: 1, duration: 120, ease: 'Back.easeOut' });
    });
    container.on('pointerdown', () => {
      this.tweens.add({ targets: container, scaleX: 0.97, scaleY: 0.94, duration: 80, ease: 'Quad.easeOut' });
    });
    container.on('pointerup', () => {
      console.info(`Starting level ${level.id}`);
      this.scene.start('GameScene', { levelId: level.id });
    });
  }
}
