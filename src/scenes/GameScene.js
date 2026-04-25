import { CONFIG, UI } from '../config/constants.js';
import Block from '../entities/Block.js';
import Funnel from '../entities/Funnel.js';
import Marble from '../entities/Marble.js';
import Queue from '../entities/Queue.js';
import Tray from '../entities/Tray.js';
import BoardManager from '../systems/BoardManager.js';
import LevelLoader from '../systems/LevelLoader.js';
import { makeWorldHitZone } from '../ui/hitZones.js';

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  init(data = {}) {
    this.levelId = data.levelId || 1;
    this.fromEditor = Boolean(data.fromEditor);
    this.levelKey = LevelLoader.cacheKey(this.levelId);
    this._inputLocked = false;
    this.isEnding = false;
    this._debugEnabled = false;
    this._debugText = null;
  }

  preload() {
    if (this.fromEditor) return;
    if (!this.cache.json.exists(this.levelKey)) {
      this.load.json(this.levelKey, LevelLoader.pathFor(this.levelId));
    }
  }

  create() {
    const levelData = this.fromEditor
      ? window._customLevelData
      : this.cache.json.get(this.levelKey);

    try {
      this.levelData = LevelLoader.validate(levelData);
    } catch (error) {
      this._drawLoadError(error);
      return;
    }

    this.cameras.main.setBackgroundColor('#1a1a2e');
    this._drawAreas();
    this._drawHUD();

    this.funnel = new Funnel(this);
    this.trays = this._createTrays(this.levelData.trays);
    this.queue = new Queue(this, this.levelData.queue_capacity, this.trays);
    this.blocks = this.levelData.blocks.map((blockData) => (
      new Block(this, blockData, this.levelData.board_size)
    ));
    this.boardManager = new BoardManager(this.blocks);

    this.events.on('block-tapped', this._onBlockTapped, this);
    this.events.on('queue-overflow', this._onQueueOverflow, this);
    this.events.on('tray-completed', this._onTrayCompleted, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this._shutdown, this);
    this.input.keyboard.on('keydown-D', this._toggleDebugOverlay, this);

    this._createGeneration = (this._createGeneration || 0) + 1;

    if (this.levelId === 1 && !this.fromEditor) {
      this._showToast(
        'Tap blocks to send marbles to the queue. Match colors with the trays below!',
        3000
      );
    }
  }

  _shutdown() {
    this.events.off('block-tapped', this._onBlockTapped, this);
    this.events.off('queue-overflow', this._onQueueOverflow, this);
    this.events.off('tray-completed', this._onTrayCompleted, this);
    this.input.keyboard.off('keydown-D', this._toggleDebugOverlay, this);
    this._debugTimer?.remove(false);
    this.blocks?.forEach((block) => block.destroy());
    this.blocks = [];
  }

  _drawAreas() {
    const g = this.add.graphics();
    g.setDepth(0);

    g.fillStyle(UI.PANEL_DARK, 1);
    g.fillRoundedRect(
      CONFIG.BOARD_AREA.x,
      CONFIG.BOARD_AREA.y,
      CONFIG.BOARD_AREA.width,
      CONFIG.BOARD_AREA.height,
      28
    );
    g.lineStyle(3, 0xffffff, 0.08);
    g.strokeRoundedRect(
      CONFIG.BOARD_AREA.x,
      CONFIG.BOARD_AREA.y,
      CONFIG.BOARD_AREA.width,
      CONFIG.BOARD_AREA.height,
      28
    );

    g.fillStyle(0xffffff, 0.04);
    g.fillRoundedRect(
      CONFIG.FUNNEL_AREA.x - 12,
      CONFIG.FUNNEL_AREA.y - 10,
      CONFIG.FUNNEL_AREA.width + 24,
      CONFIG.FUNNEL_AREA.height + 20,
      24
    );

    g.fillStyle(0xffffff, 0.03);
    g.fillRoundedRect(
      CONFIG.TRAY_AREA.x - 10,
      CONFIG.TRAY_AREA.y - 10,
      CONFIG.TRAY_AREA.width + 20,
      CONFIG.TRAY_AREA.height + 20,
      26
    );
  }

  _drawHUD() {
    const back = this.add.text(48, 48, '←', {
      fontSize: '46px',
      color: UI.TEXT,
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(500);
    makeWorldHitZone(this, 48, 48, 80, 80, () => {
      this.scene.start(this.fromEditor ? 'EditorScene' : 'LevelSelectScene');
    }, { depth: 520 });

    const title = this.levelData?.name || 'Level';
    this.add.text(CONFIG.GAME_WIDTH / 2, 46, title.toUpperCase(), {
      fontSize: '30px',
      color: UI.TEXT,
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(500);

    this.queueLabel = this.add.text(CONFIG.GAME_WIDTH - 42, 48, '', {
      fontSize: '20px',
      color: UI.MUTED_TEXT,
      fontStyle: 'bold'
    }).setOrigin(1, 0.5).setDepth(500);
    this.time.addEvent({
      delay: 100,
      loop: true,
      callback: () => {
        if (!this.queue) return;
        this.queueLabel.setText(`${this.queue.marbles.length}/${this.queue.capacity}`);
      }
    });
  }

  _createTrays(trayData) {
    const count = trayData.length;
    const area = CONFIG.TRAY_AREA;
    const spacing = area.width / (count + 1);

    return trayData.map((tray, index) => {
      const x = area.x + spacing * (index + 1);
      const y = area.y + 92;
      return new Tray(this, x, y, tray.color, tray.capacity);
    });
  }

  _onBlockTapped(block) {
    if (this.isEnding || !block.refreshInteractivity()) return;

    block.shatter();
    this.boardManager.onBlockCleared(block);

    const startX = block.container.x;
    const startY = block.container.y;
    const color = block.data.color;
    const funnelX = CONFIG.FUNNEL_AREA.x + CONFIG.FUNNEL_AREA.width / 2;
    const funnelY = CONFIG.FUNNEL_AREA.y + CONFIG.FUNNEL_AREA.height - 8;

    for (let i = 0; i < CONFIG.MARBLES_PER_BLOCK; i += 1) {
      this.time.delayedCall(i * 80, () => {
        if (this.isEnding) return;
        const marble = new Marble(
          this,
          startX + Phaser.Math.Between(-30, 30),
          startY + Phaser.Math.Between(-8, 8),
          color
        );
        marble.state = 'falling';
        marble.flyTo(
          funnelX + Phaser.Math.Between(-12, 12),
          funnelY,
          CONFIG.MARBLE_FALL_DURATION,
          'Cubic.easeIn',
          () => this.queue.enqueue(marble)
        );
      });
    }
  }

  _onTrayCompleted() {
    if (this.isEnding) return;
    this.queue.evaluateMatching();
    this._checkVictory();
  }

  _checkVictory() {
    if (this.isEnding) return;
    if (!this.trays.every((tray) => tray.isCompleted)) return;

    this._inputLocked = true;
    this.blocks.forEach((block) => block.refreshInteractivity());
    this.isEnding = true;
    this.time.delayedCall(420, () => {
      this.scene.start('GameOverScene', {
        result: 'win',
        levelId: this.levelId,
        fromEditor: this.fromEditor
      });
    });
  }

  _onQueueOverflow() {
    if (this.isEnding) return;
    this._inputLocked = true;
    this.blocks.forEach((block) => block.refreshInteractivity());
    this.isEnding = true;
    this.time.delayedCall(800, () => {
      this.scene.start('GameOverScene', {
        result: 'lose',
        levelId: this.levelId,
        fromEditor: this.fromEditor
      });
    });
  }

  _toggleDebugOverlay() {
    this._debugEnabled = !this._debugEnabled;

    if (!this._debugText) {
      this._debugText = this.add.text(18, 92, '', {
        fontSize: '16px',
        color: '#a0ffa0',
        fontStyle: 'bold',
        backgroundColor: '#000000',
        padding: { x: 10, y: 8 }
      }).setDepth(2000);
    }

    this._debugText.setVisible(this._debugEnabled);
    this._updateDebugOverlay();

    if (this._debugEnabled && !this._debugTimer) {
      this._debugTimer = this.time.addEvent({
        delay: 120,
        loop: true,
        callback: () => this._updateDebugOverlay()
      });
    }
  }

  _updateDebugOverlay() {
    if (!this._debugText || !this._debugEnabled) return;
    const lines = [
      `queue ${this.queue?.marbles.length ?? 0}/${this.queue?.capacity ?? 0}`,
      `inputLocked ${this._inputLocked}`,
      `ending ${this.isEnding}`
    ];

    this.trays?.forEach((tray) => {
      lines.push(`${tray.color}: data ${tray.current_count}/${tray.capacity} visual ${tray.visual_filled}/${tray.capacity}`);
    });

    this._debugText.setText(lines.join('\n'));
  }

  _showToast(message, duration = 2000) {
    const container = this.add.container(CONFIG.GAME_WIDTH / 2, 114);
    container.setDepth(1000);

    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.72);
    bg.fillRoundedRect(-300, -42, 600, 84, 18);
    container.add(bg);

    const text = this.add.text(0, 0, message, {
      fontSize: '20px',
      color: '#ffffff',
      fontStyle: 'bold',
      align: 'center',
      wordWrap: { width: 540 }
    }).setOrigin(0.5);
    container.add(text);

    this.time.delayedCall(duration, () => {
      this.tweens.add({
        targets: container,
        alpha: 0,
        y: container.y - 12,
        duration: 260,
        onComplete: () => container.destroy()
      });
    });
  }

  _drawLoadError(error) {
    this.cameras.main.setBackgroundColor('#1a1a2e');
    this.add.text(CONFIG.GAME_WIDTH / 2, CONFIG.GAME_HEIGHT / 2 - 40, 'LEVEL LOAD ERROR', {
      fontSize: '34px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.add.text(CONFIG.GAME_WIDTH / 2, CONFIG.GAME_HEIGHT / 2 + 20, error.message, {
      fontSize: '18px',
      color: '#ff9a9a',
      fontStyle: 'bold',
      align: 'center',
      wordWrap: { width: 560 }
    }).setOrigin(0.5);
  }
}
