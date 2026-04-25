import { CONFIG } from '../config/constants.js';
import { getColorDefinition } from '../config/colors.js';

export default class Block {
  constructor(scene, data, boardSize = { cols: 5, rows: 5 }) {
    this.scene = scene;
    this.data = data;
    this.boardSize = boardSize;
    this.isCovered = false;
    this.isCleared = false;
    this._inputEnabled = null;

    const position = Block.getBoardPosition(data.col, data.row, boardSize);
    this.container = scene.add.container(position.x, position.y);
    this.container.setDepth(100 + data.z);
    this.container.setSize(CONFIG.BLOCK_SIZE, CONFIG.BLOCK_SIZE);
    this.visualLayer = scene.add.container(0, 0);
    this.container.add(this.visualLayer);
    this.hitZone = scene.add.zone(position.x, position.y, CONFIG.BLOCK_SIZE, CONFIG.BLOCK_SIZE);
    this.hitZone.setOrigin(0.5);
    this.hitZone.setDepth(1000 + data.z);

    this.render();
    this.setupInteraction();
    this.refreshInteractivity();
  }

  static getBoardPosition(col, row, boardSize = { cols: 5, rows: 5 }) {
    const gridWidth = boardSize.cols * CONFIG.BLOCK_SIZE;
    const gridHeight = boardSize.rows * CONFIG.BLOCK_SIZE;
    const startX = CONFIG.BOARD_AREA.x + (CONFIG.BOARD_AREA.width - gridWidth) / 2;
    const startY = CONFIG.BOARD_AREA.y + (CONFIG.BOARD_AREA.height - gridHeight) / 2;

    return {
      x: startX + col * CONFIG.BLOCK_SIZE + CONFIG.BLOCK_SIZE / 2,
      y: startY + row * CONFIG.BLOCK_SIZE + CONFIG.BLOCK_SIZE / 2
    };
  }

  static createVisual(scene, colorId, options = {}) {
    const size = options.size || CONFIG.BLOCK_SIZE;
    const radius = options.radius || Math.round(size * 0.17);
    const colorDef = getColorDefinition(colorId);
    const showQuestion = Boolean(options.showQuestion);
    const isCovered = Boolean(options.covered);
    const alpha = options.alpha ?? 1;
    const fill = showQuestion ? 0x74748b : colorDef.hex;

    const container = scene.add.container(0, 0);
    container.setAlpha(alpha);

    const g = scene.add.graphics();
    g.fillStyle(fill, 1);
    g.fillRoundedRect(-size / 2, -size / 2, size, size, radius);

    if (!showQuestion) {
      g.fillStyle(0xffffff, isCovered ? 0.12 : 0.28);
      g.fillCircle(0, 0, size * 0.25);
      g.lineStyle(Math.max(2, size * 0.03), 0x000000, isCovered ? 0.24 : 0.18);
      g.strokeCircle(0, 0, size * 0.25);
    } else {
      g.fillStyle(0xffffff, 0.08);
      g.fillCircle(0, 0, size * 0.25);
    }

    if (isCovered && !showQuestion) {
      g.fillStyle(0x000000, 0.35);
      g.fillRoundedRect(-size / 2, -size / 2, size, size, radius);
    }

    container.add(g);

    if (showQuestion) {
      const question = scene.add.text(0, 2, '?', {
        fontSize: `${Math.round(size * 0.56)}px`,
        color: '#ffffff',
        fontStyle: 'bold'
      }).setOrigin(0.5);
      container.add(question);
    }

    return container;
  }

  render() {
    this.visualLayer.removeAll(true);

    const showQuestion = this.data.is_hidden && this.isCovered;
    const visual = Block.createVisual(this.scene, this.data.color, {
      showQuestion,
      covered: this.isCovered,
      size: CONFIG.BLOCK_SIZE
    });
    this.visualLayer.add(visual);
    this.visualLayer.setAlpha(this.isCovered && !showQuestion ? 0.75 : 1);
  }

  setupInteraction() {
    this.hitZone.setInteractive({ useHandCursor: true });
    this._bindHitZoneEvents();
  }

  _bindHitZoneEvents() {
    this.hitZone.off('pointerover');
    this.hitZone.off('pointerout');
    this.hitZone.off('pointerdown');
    this.hitZone.off('pointerup');
    this.hitZone.on('pointerover', () => {
      if (!this.refreshInteractivity()) return;
      this.scene.tweens.add({
        targets: this.visualLayer,
        scale: 1.08,
        duration: 100,
        ease: 'Quad.easeOut'
      });
    });

    this.hitZone.on('pointerout', () => {
      if (!this.refreshInteractivity()) return;
      this.scene.tweens.add({
        targets: this.visualLayer,
        scale: 1,
        duration: 100,
        ease: 'Quad.easeOut'
      });
    });

    this.hitZone.on('pointerdown', () => {
      if (!this.refreshInteractivity()) return;
      this.scene.tweens.add({
        targets: this.visualLayer,
        scale: 0.94,
        duration: 70,
        ease: 'Quad.easeOut'
      });
    });

    this.hitZone.on('pointerup', () => {
      if (!this.refreshInteractivity()) return;
      this.scene.events.emit('block-tapped', this);
    });
  }

  setInputEnabled(enabled) {
    if (!this.hitZone) return;
    if (this._inputEnabled === enabled && this.hitZone.input) return;
    this._inputEnabled = enabled;

    if (enabled) {
      this.hitZone.setVisible(true);
      if (this.hitZone.input) {
        this.hitZone.input.enabled = true;
      } else {
        this.hitZone.setInteractive({ useHandCursor: true });
        this._bindHitZoneEvents();
      }
      return;
    }

    if (this.hitZone.input) this.hitZone.input.enabled = false;
    this.hitZone.setVisible(false);
  }

  refreshInteractivity() {
    // 可点击必须同时满足三个守卫：未被遮挡且未清除、GameScene 未输入锁、未来 GravityFlip 未处于翻转中。
    const canInteract = !this.isCovered
      && !this.isCleared
      && !this.scene._inputLocked
      && !this.scene.gravityFlip?.isFlipping;
    this.setInputEnabled(canInteract);
    return canInteract;
  }

  setCovered(isCovered) {
    const wasCovered = this.isCovered;
    this.isCovered = isCovered;

    if (this.isCleared) return;

    if (wasCovered && !isCovered && this.data.is_hidden) {
      this.reveal();
      return;
    }

    this.render();
    this.refreshInteractivity();
  }

  reveal() {
    this.render();
    this.refreshInteractivity();
    this.visualLayer.setScale(0.15, 1);
    this.scene.tweens.add({
      targets: this.visualLayer,
      scaleX: 1,
      scaleY: 1,
      duration: 260,
      ease: 'Back.easeOut'
    });
  }

  shatter() {
    if (this.isCleared) return;

    this.isCleared = true;
    this.refreshInteractivity();
    this.hitZone.removeInteractive();
    this.hitZone.setVisible(false);
    this.scene.tweens.add({
      targets: this.visualLayer,
      scale: 0.1,
      alpha: 0,
      angle: Phaser.Math.Between(-10, 10),
      duration: 180,
      ease: 'Back.easeIn',
      onComplete: () => {
        this.container.setVisible(false);
      }
    });
  }

  destroy() {
    if (this.hitZone) {
      this.hitZone.removeAllListeners();
      this.hitZone.destroy();
      this.hitZone = null;
    }

    if (this.container) {
      this.container.destroy(true);
      this.container = null;
      this.visualLayer = null;
    }
  }
}
