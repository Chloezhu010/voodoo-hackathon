import { ART_KEYS, hasArtTexture } from '../assets/artAssets.js';
import { CONFIG, UI } from '../config/constants.js';
import { Block } from '../entities/Block.js';
import { BoxColumn } from '../entities/BoxColumn.js';
import { Conveyor } from '../entities/Conveyor.js';
import { Funnel } from '../entities/Funnel.js';
import { Marble } from '../entities/Marble.js';
import { OutputPort } from '../entities/OutputPort.js';
import { levelCacheKey, levelPathFor, validateLevel } from '../sim/levelLoader.js';
import type { BoxColumn as BoxColumnConfig, LevelData, WallCell } from '../sim/types.js';
import { BoardManager } from '../systems/BoardManager.js';
import {
  addBubbleButton,
  addHudPill,
  addOutlinedText,
  drawBubblePanel,
  drawSkyBackground,
} from '../ui/casualStyle.js';
import { attachHitZone } from '../ui/hitZones.js';

interface GameSceneData {
  levelId?: number;
  fromEditor?: boolean;
}

declare global {
  interface Window {
    _customLevelData?: LevelData;
  }
}

export class GameScene extends Phaser.Scene {
  levelId = 1;
  fromEditor = false;
  levelKey = '';
  _inputLocked = false;
  isEnding = false;
  private _debugEnabled = false;
  private _debugText: Phaser.GameObjects.Text | null = null;
  private _debugTimer?: Phaser.Time.TimerEvent;
  marbles: Marble[] = [];
  levelData!: LevelData;
  funnel?: Funnel;
  conveyor?: Conveyor;
  boxColumns: BoxColumn[] = [];
  outputPorts: OutputPort[] = [];
  blocks: Block[] = [];
  boardManager?: BoardManager;
  conveyorLabel?: Phaser.GameObjects.Text;
  private _createGeneration = 0;

  constructor() {
    super('GameScene');
  }

  init(data: GameSceneData = {}): void {
    this.levelId = data.levelId ?? 1;
    this.fromEditor = Boolean(data.fromEditor);
    this.levelKey = levelCacheKey(this.levelId);
    this._inputLocked = false;
    this.isEnding = false;
    this._debugEnabled = false;
    this._debugText = null;
    this.marbles = [];
  }

  preload(): void {
    if (this.fromEditor) return;
    if (!this.cache.json.exists(this.levelKey)) {
      this.load.json(this.levelKey, levelPathFor(this.levelId));
    }
  }

  create(): void {
    const levelData: LevelData | undefined = this.fromEditor
      ? window._customLevelData
      : this.cache.json.get(this.levelKey);

    try {
      this.levelData = validateLevel(levelData);
    } catch (error) {
      this._drawLoadError(error as Error);
      return;
    }

    drawSkyBackground(this);
    this._drawAreas();
    this._drawHUD();

    this.funnel = new Funnel(this);
    this.conveyor = new Conveyor(this, this.levelData.conveyor_speed ?? CONFIG.CONVEYOR.DEFAULT_SPEED);
    this.boxColumns = this._createBoxColumns(this.levelData.box_columns);
    this.outputPorts = this.boxColumns.map((boxColumn, index) => {
      const port = new OutputPort(this, this.conveyor!.track, index, boxColumn);
      this.conveyor!.registerOutputPort(port);
      boxColumn.outputPort = port;
      return port;
    });

    this.blocks = this.levelData.blocks.map((blockData) => (
      new Block(this, blockData, this.levelData.board_size)
    ));
    this.boardManager = new BoardManager(
      this.blocks,
      this.levelData.board_size,
      this.levelData.walls ?? [],
    );

    this.events.on('block-tapped', this._onBlockTapped, this);
    this.events.on('conveyor-overflow', this._onConveyorOverflow, this);
    this.events.on('column-cleared', this._onColumnCleared, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this._shutdown, this);
    this.input.keyboard?.on('keydown-D', this._toggleDebugOverlay, this);

    this._createGeneration += 1;

    if (this.levelId === 1 && !this.fromEditor) {
      this._showToast('Tap blocks to feed the conveyor. Boxes only accept their top color.', 3000);
    }
  }

  override update(_time: number, delta: number): void {
    this.conveyor?.update(delta);
    this.funnel?.update(this.conveyor, delta);
  }

  private _shutdown(): void {
    this.events.off('block-tapped', this._onBlockTapped, this);
    this.events.off('conveyor-overflow', this._onConveyorOverflow, this);
    this.events.off('column-cleared', this._onColumnCleared, this);
    this.input.keyboard?.off('keydown-D', this._toggleDebugOverlay, this);
    this._debugTimer?.remove(false);
    this.funnel?.destroy();
    this.blocks.forEach((block) => block.destroy());
    this.blocks = [];
  }

  private _drawAreas(): void {
    const g = this.add.graphics();
    g.setDepth(0);

    if (hasArtTexture(this, ART_KEYS.playfieldShell)) {
      const shell = this.add.image(0, 0, ART_KEYS.playfieldShell).setOrigin(0).setDepth(0);
      const shellHeight = CONFIG.GAME_WIDTH * (shell.height / shell.width);
      shell.setDisplaySize(CONFIG.GAME_WIDTH, shellHeight);
    } else {
      this._drawPlayfieldShell(g);
      this._drawConveyorDock(g);
    }
    this._drawWallRegions();
  }

  private _drawPlayfieldShell(g: Phaser.GameObjects.Graphics): void {
    const shell = [
      { x: 92, y: 126 },
      { x: 626, y: 130 },
      { x: 674, y: 168 },
      { x: 686, y: 632 },
      { x: 676, y: 666 },
      { x: 646, y: 696 },
      { x: 500, y: 724 },
      { x: 454, y: 746 },
      { x: 426, y: 780 },
      { x: 426, y: 812 },
      { x: 624, y: 812 },
      { x: 666, y: 846 },
      { x: 682, y: 892 },
      { x: 682, y: 1088 },
      { x: 640, y: 1128 },
      { x: 80, y: 1128 },
      { x: 38, y: 1088 },
      { x: 38, y: 892 },
      { x: 54, y: 846 },
      { x: 96, y: 812 },
      { x: 294, y: 812 },
      { x: 294, y: 780 },
      { x: 266, y: 746 },
      { x: 220, y: 724 },
      { x: 76, y: 696 },
      { x: 44, y: 666 },
      { x: 34, y: 632 },
      { x: 48, y: 166 },
    ] as const;

    const highlight = [
      { x: 92, y: 166 },
      { x: 620, y: 166 },
      { x: 644, y: 190 },
      { x: 656, y: 612 },
      { x: 612, y: 646 },
      { x: 484, y: 670 },
      { x: 436, y: 698 },
      { x: 398, y: 746 },
      { x: 398, y: 796 },
      { x: 602, y: 830 },
      { x: 636, y: 868 },
      { x: 642, y: 912 },
      { x: 642, y: 1062 },
      { x: 612, y: 1086 },
      { x: 108, y: 1086 },
      { x: 78, y: 1062 },
      { x: 78, y: 912 },
      { x: 84, y: 868 },
      { x: 118, y: 830 },
      { x: 322, y: 796 },
      { x: 322, y: 746 },
      { x: 284, y: 698 },
      { x: 236, y: 670 },
      { x: 108, y: 646 },
      { x: 66, y: 616 },
      { x: 74, y: 190 },
    ] as const;

    this._fillPolygon(g, shell, 0x314d83, 0.26, 14);
    this._fillPolygon(g, shell, 0xa7c4d0, 1);
    this._fillPolygon(g, highlight, 0xc8dbe2, 0.34);
    this._strokePolygon(g, shell, 22, 0x38598e, 0.52, 10);
    this._strokePolygon(g, shell, 14, 0x466aa0, 0.96);
    this._strokePolygon(g, shell, 4, 0xd7ecf4, 0.26, -2);
  }

  private _drawConveyorDock(g: Phaser.GameObjects.Graphics): void {
    const boxArea = CONFIG.BOX_COLUMNS.AREA;
    g.fillStyle(0x4969a1, 0.16);
    g.fillRoundedRect(boxArea.x, boxArea.y - 22, boxArea.width, boxArea.height + 48, 22);
  }

  private _drawWallRegions(): void {
    const walls = this.levelData.walls ?? [];
    if (walls.length === 0) return;

    const g = this.add.graphics();
    g.setDepth(6);
    this._wallComponents(walls).forEach((component, index) => {
      this._drawWallComponent(g, component, index);
    });
  }

  private _drawWallComponent(
    g: Phaser.GameObjects.Graphics,
    component: readonly WallCell[],
    componentIndex: number,
  ): void {
    const edges = this._wallBoundaryEdges(component);
    const size = CONFIG.BLOCK_SIZE;

    g.fillStyle(0x3b5c77, 1);
    component.forEach((wall) => {
      const pos = Block.getBoardPosition(wall.col, wall.row, this.levelData.board_size);
      g.fillRect(pos.x - size / 2, pos.y - size / 2, size, size);
    });

    this._strokeWallEdges(g, edges, componentIndex, 16, 0x243d5d, 0.24, 9);
    this._strokeWallEdges(g, edges, componentIndex, 8, 0x254661, 0.94, 0);
    this._strokeWallEdges(g, edges, componentIndex, 3, 0xc7dbe5, 0.22, -2);
  }

  private _wallComponents(walls: readonly WallCell[]): WallCell[][] {
    const remaining = new Map(walls.map((wall) => [this._cellKey(wall), wall]));
    const components: WallCell[][] = [];

    for (const wall of walls) {
      const firstKey = this._cellKey(wall);
      if (!remaining.has(firstKey)) continue;
      const component: WallCell[] = [];
      const queue = [wall];
      remaining.delete(firstKey);

      while (queue.length > 0) {
        const current = queue.shift()!;
        component.push(current);
        [
          { col: current.col - 1, row: current.row },
          { col: current.col + 1, row: current.row },
          { col: current.col, row: current.row - 1 },
          { col: current.col, row: current.row + 1 },
        ].forEach((next) => {
          const key = this._cellKey(next);
          const queued = remaining.get(key);
          if (!queued) return;
          remaining.delete(key);
          queue.push(queued);
        });
      }

      components.push(component);
    }

    return components;
  }

  private _wallBoundaryEdges(component: readonly WallCell[]): { a: WallCell; b: WallCell }[] {
    const edgeMap = new Map<string, { a: WallCell; b: WallCell; count: number }>();
    component.forEach((wall) => {
      [
        { a: { col: wall.col, row: wall.row }, b: { col: wall.col + 1, row: wall.row } },
        { a: { col: wall.col + 1, row: wall.row }, b: { col: wall.col + 1, row: wall.row + 1 } },
        { a: { col: wall.col + 1, row: wall.row + 1 }, b: { col: wall.col, row: wall.row + 1 } },
        { a: { col: wall.col, row: wall.row + 1 }, b: { col: wall.col, row: wall.row } },
      ].forEach((edge) => {
        const key = this._edgeKey(edge.a, edge.b);
        const existing = edgeMap.get(key);
        if (existing) {
          existing.count += 1;
          return;
        }
        edgeMap.set(key, { ...edge, count: 1 });
      });
    });

    return [...edgeMap.values()]
      .filter((edge) => edge.count === 1)
      .map(({ a, b }) => ({ a, b }));
  }

  private _strokeWallEdges(
    g: Phaser.GameObjects.Graphics,
    edges: readonly { a: WallCell; b: WallCell }[],
    componentIndex: number,
    width: number,
    color: number,
    alpha: number,
    offsetY: number,
  ): void {
    g.lineStyle(width, color, alpha);
    edges.forEach((edge) => {
      const a = this._wallVertexPosition(edge.a, componentIndex);
      const b = this._wallVertexPosition(edge.b, componentIndex);
      g.beginPath();
      g.moveTo(a.x, a.y + offsetY);
      g.lineTo(b.x, b.y + offsetY);
      g.strokePath();
    });
  }

  private _wallVertexPosition(vertex: WallCell, componentIndex: number): { x: number; y: number } {
    const size = CONFIG.BLOCK_SIZE;
    const gridWidth = this.levelData.board_size.cols * size;
    const gridHeight = this.levelData.board_size.rows * size;
    const startX = CONFIG.BOARD_AREA.x + (CONFIG.BOARD_AREA.width - gridWidth) / 2;
    const startY = CONFIG.BOARD_AREA.y + (CONFIG.BOARD_AREA.height - gridHeight) / 2;
    const wobbleX = (((vertex.col * 17 + vertex.row * 29 + componentIndex * 11) % 9) - 4) * 0.7;
    const wobbleY = (((vertex.col * 23 + vertex.row * 13 + componentIndex * 7) % 9) - 4) * 0.7;
    return {
      x: startX + vertex.col * size + wobbleX,
      y: startY + vertex.row * size + wobbleY,
    };
  }

  private _fillPolygon(
    graphics: Phaser.GameObjects.Graphics,
    points: readonly { x: number; y: number }[],
    color: number,
    alpha: number,
    offsetY = 0,
  ): void {
    if (points.length === 0) return;
    graphics.fillStyle(color, alpha);
    graphics.beginPath();
    graphics.moveTo(points[0]!.x, points[0]!.y + offsetY);
    for (let i = 1; i < points.length; i += 1) {
      graphics.lineTo(points[i]!.x, points[i]!.y + offsetY);
    }
    graphics.closePath();
    graphics.fillPath();
  }

  private _strokePolygon(
    graphics: Phaser.GameObjects.Graphics,
    points: readonly { x: number; y: number }[],
    width: number,
    color: number,
    alpha: number,
    offsetY = 0,
  ): void {
    if (points.length === 0) return;
    graphics.lineStyle(width, color, alpha);
    graphics.beginPath();
    graphics.moveTo(points[0]!.x, points[0]!.y + offsetY);
    for (let i = 1; i < points.length; i += 1) {
      graphics.lineTo(points[i]!.x, points[i]!.y + offsetY);
    }
    graphics.closePath();
    graphics.strokePath();
  }

  private _cellKey(cell: Pick<WallCell, 'col' | 'row'>): string {
    return `${cell.col}:${cell.row}`;
  }

  private _edgeKey(a: WallCell, b: WallCell): string {
    const first = this._cellKey(a);
    const second = this._cellKey(b);
    return first < second ? `${first}|${second}` : `${second}|${first}`;
  }

  private _drawHUD(): void {
    const back = this._addSettingsBackButton();
    back.on('pointerup', () => {
      this.scene.start(this.fromEditor ? 'EditorScene' : 'LevelSelectScene');
    });

    const title = this.levelData?.name ?? 'Level';
    addHudPill(this, CONFIG.GAME_WIDTH / 2, 48, 230, 58, title.toUpperCase(), {
      fill: UI.PRIMARY,
      dark: UI.PRIMARY_DARK,
      fontSize: title.length > 12 ? '18px' : '22px',
      depth: 500,
    });

    const countPill = addHudPill(this, CONFIG.GAME_WIDTH - 132, 48, 170, 58, '0/24', {
      fill: UI.PRIMARY,
      dark: UI.PRIMARY_DARK,
      fontSize: '24px',
      depth: 500,
    });
    this._addHudIcon(hasArtTexture(this, ART_KEYS.coin) ? ART_KEYS.coin : null, CONFIG.GAME_WIDTH - 196, 48, 42);
    this.conveyorLabel = countPill.labelText;
    this.time.addEvent({
      delay: 100,
      loop: true,
      callback: () => {
        if (!this.conveyor) return;
        this.conveyorLabel?.setText(`${this.conveyor.count()}/${CONFIG.CONVEYOR.TOTAL_CAPACITY}`);
      },
    });
  }

  private _addSettingsBackButton(): Phaser.GameObjects.Container {
    if (!hasArtTexture(this, ART_KEYS.settingsButton)) {
      return addBubbleButton(this, 48, 48, 80, 80, '<', {
        fill: UI.PRIMARY,
        dark: UI.PRIMARY_DARK,
        fontSize: '40px',
        radius: 18,
        depth: 500,
      });
    }

    const container = this.add.container(48, 48);
    container.setDepth(500);
    container.add(this.add.image(0, 0, ART_KEYS.settingsButton).setDisplaySize(88, 88));
    container.setSize(80, 80);
    attachHitZone(this, container, 80, 80, { depth: 501 });
    return container;
  }

  private _addHudIcon(key: string | null, x: number, y: number, size: number): void {
    if (!key) return;
    this.add.image(x, y, key).setDisplaySize(size, size).setDepth(510);
  }

  private _createBoxColumns(columnData: readonly BoxColumnConfig[]): BoxColumn[] {
    return [...columnData]
      .sort((a, b) => a.col - b.col)
      .map((column) => new BoxColumn(this, column.col, column.boxes, this._getColumnX(column.col)));
  }

  private _getColumnX(col: number): number {
    const port = CONFIG.OUTPUT_PORTS;
    const conveyor = CONFIG.CONVEYOR;
    const totalSpan = 3 * port.GAP_BETWEEN;
    const startX = conveyor.AREA.x + (conveyor.AREA.width - totalSpan) / 2;
    return startX + col * port.GAP_BETWEEN;
  }

  private _onBlockTapped(block: Block): void {
    if (this.isEnding || !block.refreshInteractivity()) return;
    if (!block.container || !this.funnel || !this.boardManager) return;

    const startX = block.container.x;
    const startY = block.container.y;
    const color = block.data.color;

    block.shatter();
    this.boardManager.onBlockCleared(block);

    for (let i = 0; i < CONFIG.MARBLES_PER_BLOCK; i += 1) {
      this.time.delayedCall(i * 70, () => {
        if (this.isEnding) return;
        const gridCol = i % 3;
        const gridRow = Math.floor(i / 3);
        const spawnX = startX + (gridCol - 1) * 11 + Phaser.Math.Between(-2, 2);
        const spawnY = startY + (gridRow - 1) * 7 + Phaser.Math.Between(-2, 2);
        const marble = new Marble(
          this,
          spawnX,
          spawnY,
          color,
        );
        this.marbles.push(marble);
        this._dropMarbleFromBlock(marble, startX);
      });
    }
  }

  private _dropMarbleFromBlock(marble: Marble, sourceX: number): void {
    const funnelSlot = this.funnel?.reserveSlot(marble, sourceX);
    const mouth = this.funnel?.getMouthPosition(funnelSlot);
    if (!funnelSlot || !mouth || !marble.sprite) return;

    const startX = marble.sprite.x;
    const startY = marble.sprite.y;

    marble.state = 'moving-to-funnel-mouth';
    marble.followPath(
      CONFIG.MARBLE_TO_FUNNEL_MOUTH_DURATION + 160,
      (t) => {
        const fallT = t * t;
        const driftStart = 0.28;
        const driftRaw = Phaser.Math.Clamp((t - driftStart) / (1 - driftStart), 0, 1);
        const driftT = driftRaw * driftRaw * (3 - 2 * driftRaw);
        const x = startX + (mouth.x - startX) * driftT;
        const y = startY + (mouth.y - startY) * fallT;
        marble.setPositionDirect(x, y);
        if (t > 0.62) marble.state = 'falling-into-funnel';
      },
      'Linear',
      () => {
        if (this.isEnding || marble.state === 'destroyed') return;
        this.funnel?.dropMarble(marble, funnelSlot);
      },
    );
  }

  private _onColumnCleared(): void {
    this._checkVictory();
  }

  private _checkVictory(): void {
    if (this.isEnding) return;
    if (!this.boxColumns.every((column) => column.isEmpty())) return;

    this._inputLocked = true;
    this.blocks.forEach((block) => block.refreshInteractivity());
    this.isEnding = true;
    this.time.delayedCall(600, () => {
      this.scene.start('GameOverScene', {
        result: 'win',
        levelId: this.levelId,
        fromEditor: this.fromEditor,
      });
    });
  }

  private _onConveyorOverflow(): void {
    if (this.isEnding) return;
    this._inputLocked = true;
    this.blocks.forEach((block) => block.refreshInteractivity());
    this.isEnding = true;
    this.time.delayedCall(800, () => {
      this.scene.start('GameOverScene', {
        result: 'lose',
        levelId: this.levelId,
        fromEditor: this.fromEditor,
      });
    });
  }

  private _toggleDebugOverlay(): void {
    this._debugEnabled = !this._debugEnabled;

    if (!this._debugText) {
      this._debugText = this.add.text(18, 92, '', {
        fontSize: '16px',
        color: '#a0ffa0',
        fontStyle: 'bold',
        backgroundColor: '#000000',
        padding: { x: 10, y: 8 },
      }).setDepth(2000);
    }

    this._debugText.setVisible(this._debugEnabled);
    this._updateDebugOverlay();

    if (this._debugEnabled && !this._debugTimer) {
      this._debugTimer = this.time.addEvent({
        delay: 120,
        loop: true,
        callback: () => this._updateDebugOverlay(),
      });
    }
  }

  private _updateDebugOverlay(): void {
    if (!this._debugText || !this._debugEnabled) return;
    const inFlightStates = new Set<string>([
      'moving-to-funnel-mouth',
      'falling-into-funnel',
      'in-funnel-physics',
      'dropping-to-box',
      'flying-to-magnet-target',
      'leaving-funnel',
    ]);
    const inFlight = this.marbles.filter((marble) => inFlightStates.has(marble.state)).length;
    const lines = [
      `Conveyor ${this.conveyor?.count() ?? 0}/${CONFIG.CONVEYOR.TOTAL_CAPACITY}`,
      `Speed ${this.conveyor?.speed ?? 0}`,
      `Paused ${Boolean(this.conveyor?.isPaused)}`,
      `Funnel ${this.funnel?.count() ?? 0}/${CONFIG.FUNNEL_BUFFER.CAPACITY}`,
      `Input locked ${this._inputLocked}`,
      `In flight ${inFlight}`,
    ];

    this.boxColumns.forEach((column) => {
      const colors = column.getColorSequence();
      lines.push(
        `Col${column.columnIndex}: ${colors.length ? `[${colors.join(', ')}] top=${colors[0]}` : 'CLEARED'}`,
      );
    });

    this._debugText.setText(lines.join('\n'));
  }

  private _showToast(message: string, duration = 2000): void {
    const container = this.add.container(CONFIG.GAME_WIDTH / 2, 114);
    container.setDepth(1000);

    const bg = this.add.graphics();
    drawBubblePanel(bg, -300, -42, 600, 84, 24, {
      fill: 0x18d84f,
      stroke: 0x08752d,
      strokeWidth: 4,
      shadowOffset: 7,
      shadowAlpha: 0.18,
      highlightAlpha: 0.24,
    });
    container.add(bg);

    const text = this.add.text(0, 0, message, {
      fontSize: '20px',
      color: '#ffffff',
      fontStyle: 'bold',
      align: 'center',
      wordWrap: { width: 540 },
    }).setOrigin(0.5);
    container.add(text);

    this.time.delayedCall(duration, () => {
      this.tweens.add({
        targets: container,
        alpha: 0,
        y: container.y - 12,
        duration: 260,
        onComplete: () => container.destroy(),
      });
    });
  }

  private _drawLoadError(error: Error): void {
    drawSkyBackground(this);
    const panel = this.add.graphics();
    drawBubblePanel(panel, 70, 470, 580, 240, 36, {
      fill: 0xf3fbff,
      stroke: UI.BLUE_STROKE,
      strokeWidth: 6,
      shadowOffset: 10,
    });
    addOutlinedText(this, CONFIG.GAME_WIDTH / 2, CONFIG.GAME_HEIGHT / 2 - 46, 'LEVEL LOAD ERROR', {
      fontSize: '34px',
      color: '#ff8ca9',
      stroke: '#97345f',
      strokeThickness: 6,
    });
    this.add.text(CONFIG.GAME_WIDTH / 2, CONFIG.GAME_HEIGHT / 2 + 20, error.message, {
      fontSize: '18px',
      color: UI.DARK_TEXT,
      fontStyle: 'bold',
      align: 'center',
      wordWrap: { width: 560 },
    }).setOrigin(0.5);
  }
}
