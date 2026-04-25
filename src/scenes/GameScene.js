import { CONFIG, UI } from '../config/constants.js';
import Block from '../entities/Block.js';
import BoxColumn from '../entities/BoxColumn.js';
import Conveyor from '../entities/Conveyor.js';
import Funnel from '../entities/Funnel.js';
import Marble from '../entities/Marble.js';
import OutputPort from '../entities/OutputPort.js';
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
    this.marbles = [];
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
    this.conveyor = new Conveyor(
      this,
      this.levelData.conveyor_speed || CONFIG.CONVEYOR.DEFAULT_SPEED
    );
    this.boxColumns = this._createBoxColumns(this.levelData.box_columns);
    this.outputPorts = this.boxColumns.map((boxColumn, index) => {
      const port = new OutputPort(this, this.conveyor.track, index, boxColumn);
      this.conveyor.registerOutputPort(port);
      boxColumn.outputPort = port;
      return port;
    });

    this.blocks = this.levelData.blocks.map((blockData) => (
      new Block(this, blockData, this.levelData.board_size)
    ));
    this.boardManager = new BoardManager(this.blocks);

    this.events.on('block-tapped', this._onBlockTapped, this);
    this.events.on('conveyor-overflow', this._onConveyorOverflow, this);
    this.events.on('column-cleared', this._onColumnCleared, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this._shutdown, this);
    this.input.keyboard.on('keydown-D', this._toggleDebugOverlay, this);

    this._createGeneration = (this._createGeneration || 0) + 1;

    if (this.levelId === 1 && !this.fromEditor) {
      this._showToast(
        'Tap blocks to feed the conveyor. Boxes only accept their top color.',
        3000
      );
    }
  }

  update(_time, delta) {
    this.conveyor?.update(delta);
    this.funnel?.update(this.conveyor, delta);
  }

  _shutdown() {
    this.events.off('block-tapped', this._onBlockTapped, this);
    this.events.off('conveyor-overflow', this._onConveyorOverflow, this);
    this.events.off('column-cleared', this._onColumnCleared, this);
    this.input.keyboard.off('keydown-D', this._toggleDebugOverlay, this);
    this._debugTimer?.remove(false);
    this.funnel?.destroy();
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
      20
    );

    const conveyorArea = CONFIG.CONVEYOR.AREA;
    g.fillStyle(0xffffff, 0.035);
    g.fillRoundedRect(
      conveyorArea.x,
      conveyorArea.y,
      conveyorArea.width,
      conveyorArea.height,
      30
    );

    const boxArea = CONFIG.BOX_COLUMNS.AREA;
    g.fillStyle(0xffffff, 0.025);
    g.fillRoundedRect(
      boxArea.x,
      boxArea.y,
      boxArea.width,
      boxArea.height,
      22
    );
  }

  _drawHUD() {
    this.add.text(48, 48, '<', {
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

    this.conveyorLabel = this.add.text(CONFIG.GAME_WIDTH - 42, 48, '', {
      fontSize: '20px',
      color: UI.MUTED_TEXT,
      fontStyle: 'bold'
    }).setOrigin(1, 0.5).setDepth(500);
    this.time.addEvent({
      delay: 100,
      loop: true,
      callback: () => {
        if (!this.conveyor) return;
        this.conveyorLabel.setText(`${this.conveyor.count()}/${CONFIG.CONVEYOR.TOTAL_CAPACITY}`);
      }
    });
  }

  _createBoxColumns(columnData) {
    return [...columnData]
      .sort((a, b) => a.col - b.col)
      .map((column) => new BoxColumn(
        this,
        column.col,
        column.boxes,
        this._getColumnX(column.col)
      ));
  }

  _getColumnX(col) {
    const port = CONFIG.OUTPUT_PORTS;
    const conveyor = CONFIG.CONVEYOR;
    const totalSpan = 3 * port.GAP_BETWEEN;
    const startX = conveyor.AREA.x + (conveyor.AREA.width - totalSpan) / 2;
    return startX + col * port.GAP_BETWEEN;
  }

  _onBlockTapped(block) {
    if (this.isEnding || !block.refreshInteractivity()) return;

    const startX = block.container.x;
    const startY = block.container.y;
    const color = block.data.color;

    block.shatter();
    this.boardManager.onBlockCleared(block);

    for (let i = 0; i < CONFIG.MARBLES_PER_BLOCK; i += 1) {
      this.time.delayedCall(i * 70, () => {
        if (this.isEnding) return;
        const marble = new Marble(
          this,
          startX + Phaser.Math.Between(-30, 30),
          startY + Phaser.Math.Between(-8, 8),
          color
        );
        this.marbles.push(marble);
        const funnelSlot = this.funnel.reserveSlot(marble);
        const mouth = this.funnel.getMouthPosition(funnelSlot);
        marble.state = 'moving-to-funnel-mouth';
        marble.flyTo(
          mouth.x,
          mouth.y,
          CONFIG.MARBLE_TO_FUNNEL_MOUTH_DURATION,
          'Linear',
          () => {
            if (this.isEnding || marble.state === 'destroyed') return;
            this.funnel.dropMarble(marble, funnelSlot);
          }
        );
      });
    }
  }

  _onColumnCleared() {
    this._checkVictory();
  }

  _checkVictory() {
    if (this.isEnding) return;
    if (!this.boxColumns.every((column) => column.isEmpty())) return;

    this._inputLocked = true;
    this.blocks.forEach((block) => block.refreshInteractivity());
    this.isEnding = true;
    this.time.delayedCall(600, () => {
      this.scene.start('GameOverScene', {
        result: 'win',
        levelId: this.levelId,
        fromEditor: this.fromEditor
      });
    });
  }

  _onConveyorOverflow() {
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
    const inFlightStates = new Set([
      'moving-to-funnel-mouth',
      'falling-into-funnel',
      'in-funnel-physics',
      'dropping-to-box',
      'flying-to-magnet-target',
      'leaving-funnel'
    ]);
    const inFlight = this.marbles.filter((marble) => inFlightStates.has(marble.state)).length;
    const lines = [
      `Conveyor ${this.conveyor?.count() ?? 0}/${CONFIG.CONVEYOR.TOTAL_CAPACITY}`,
      `Speed ${this.conveyor?.speed ?? 0}`,
      `Paused ${Boolean(this.conveyor?.isPaused)}`,
      `Funnel ${this.funnel?.count() ?? 0}/${CONFIG.FUNNEL_BUFFER.CAPACITY}`,
      `Input locked ${this._inputLocked}`,
      `In flight ${inFlight}`
    ];

    this.boxColumns?.forEach((column) => {
      const colors = column.getColorSequence();
      lines.push(
        `Col${column.columnIndex}: ${colors.length ? `[${colors.join(', ')}] top=${colors[0]}` : 'CLEARED'}`
      );
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
