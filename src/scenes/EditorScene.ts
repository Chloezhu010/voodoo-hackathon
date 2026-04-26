import { COLOR_IDS, getColorDefinition } from '../config/colors.js';
import { CONFIG, UI } from '../config/constants.js';
import { Block } from '../entities/Block.js';
import { EditorState } from '../sim/editorState.js';
import { validateLevel } from '../sim/levelLoader.js';
import type { BlockRecord, ColorId } from '../sim/types.js';
import { AgentBriefOverlay } from '../ui/agentBriefOverlay.js';
import { drawSkyBackground } from '../ui/casualStyle.js';
import { attachHitZone, makeWorldHitZone } from '../ui/hitZones.js';

import { EditorAgentBriefPanel } from './EditorAgentBriefPanel.js';
import { EditorJsonModals } from './EditorJsonModals.js';
import {
  BOX_COLUMN_MAX_BOXES,
  CONVEYOR_SPEED_OPTIONS,
  EDITOR_BLOCK_SIZE,
  EDITOR_CANVAS_WIDTH,
  EDITOR_CELL_SIZE,
  EDITOR_GAME_X,
  EDITOR_LAYOUT,
  GRID_START,
  type ActiveTextInput,
  type DragState,
  type HoverCell,
} from './editorLayout.js';

export class EditorScene extends Phaser.Scene {
  editorState!: EditorState;
  hoverCell: HoverCell | null = null;
  modal: Phaser.GameObjects.Container | null = null;
  activeTextInput: ActiveTextInput | null = null;
  dragState: DragState | null = null;
  lastPlacedCell: HoverCell | null = null;
  speedDrag = false;
  private readonly _speedSlider = { trackLen: 150, min: 0.08, max: 0.40 };
  root!: Phaser.GameObjects.Container;
  briefPanel!: EditorAgentBriefPanel;
  briefOverlay!: AgentBriefOverlay;
  jsonModals!: EditorJsonModals;

  constructor() {
    super('EditorScene');
  }

  create(): void {
    this.scale.setGameSize(EDITOR_CANVAS_WIDTH, CONFIG.GAME_HEIGHT);
    this.add.rectangle(
      EDITOR_CANVAS_WIDTH / 2,
      CONFIG.GAME_HEIGHT / 2,
      EDITOR_CANVAS_WIDTH,
      CONFIG.GAME_HEIGHT,
      UI.BACKGROUND_BOTTOM,
      1,
    );
    drawSkyBackground(this);
    const stage = this.add.rectangle(
      EDITOR_GAME_X + CONFIG.GAME_WIDTH / 2,
      CONFIG.GAME_HEIGHT / 2,
      CONFIG.GAME_WIDTH,
      CONFIG.GAME_HEIGHT,
      UI.BACKGROUND,
      0.94,
    );
    stage.setStrokeStyle(3, 0xffffff, 0.18);
    this.editorState = new EditorState();
    this.hoverCell = null;
    this.modal = null;
    this.activeTextInput = null;
    this.dragState = null;
    this.lastPlacedCell = null;
    this.briefOverlay = new AgentBriefOverlay({
      getEditorContext: () => ({
        levelData: this.editorState.toLevelData(),
        validation: this.editorState.getValidationStatus(),
        localBrief: this.editorState.getAgentBrief(),
      }),
      onToast: (msg) => this.showToast(msg),
      onReportUpdate: () => this.renderAll(),
    });
    this.briefOverlay.mount();
    this.briefPanel = new EditorAgentBriefPanel(this.briefOverlay);
    this.jsonModals = new EditorJsonModals(this);

    if (window._editorStateSnapshot) {
      try {
        this.editorState.importJSON(window._editorStateSnapshot);
      } catch (error) {
        console.warn('Could not restore editor state:', error);
      }
    }

    this.input.keyboard?.on('keydown', this._handleTextInput, this);
    this.input.on('pointermove', this._handlePointerMove, this);
    this.input.on('pointerup', this._handlePointerUp, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown', this._handleTextInput, this);
      this.input.off('pointermove', this._handlePointerMove, this);
      this.input.off('pointerup', this._handlePointerUp, this);
      this._clearDragPreview();
      this.briefOverlay?.unmount();
      this.scale.setGameSize(CONFIG.GAME_WIDTH, CONFIG.GAME_HEIGHT);
    });

    this.renderAll();
  }

  renderAll(options: { skipSidebars?: boolean } = {}): void {
    if (this.root) this.root.destroy(true);
    this.root = this.add.container(EDITOR_GAME_X, 0);
    this._drawHeader();
    this._drawGrid();
    this._drawPalette();
    this._drawLayerControls();
    this._drawBoxColumnsPanel();
    this._drawParams();
    if (!options.skipSidebars) this.briefPanel.drawSidebars();
    this._drawIO();
    this.lastPlacedCell = null;
  }

  private _drawHeader(): void {
    this.root.add(this.makeButton(104, 48, 132, 50, '← MENU', UI.PANEL_DARK, () => {
      this.scene.start('MenuScene');
    }));
    this.root.add(this.add.text(CONFIG.GAME_WIDTH / 2, 48, 'LEVEL EDITOR', {
      fontSize: '28px', color: UI.TEXT, fontStyle: 'bold',
    }).setOrigin(0.5));
    this.root.add(this.makeButton(602, 48, 150, 50, 'START', UI.PRIMARY, () => this._playTest()));
  }

  private _drawGrid(): void {
    const size = EDITOR_CELL_SIZE;
    const width = this.editorState.gridCols * size;
    const height = this.editorState.gridRows * size;
    const layer = this.add.container(0, 0);
    this.root.add(layer);

    const panel = this.add.graphics();
    panel.fillStyle(UI.PANEL_DARK, 1);
    panel.fillRoundedRect(GRID_START.x - 16, GRID_START.y - 16, width + 32, height + 32, 22);
    panel.lineStyle(3, 0xffffff, 0.1);
    panel.strokeRoundedRect(GRID_START.x - 16, GRID_START.y - 16, width + 32, height + 32, 22);
    panel.lineStyle(2, 0x3a3a55, 1);

    for (let col = 0; col <= this.editorState.gridCols; col += 1) {
      const x = GRID_START.x + col * size;
      panel.lineBetween(x, GRID_START.y, x, GRID_START.y + height);
    }
    for (let row = 0; row <= this.editorState.gridRows; row += 1) {
      const y = GRID_START.y + row * size;
      panel.lineBetween(GRID_START.x, y, GRID_START.x + width, y);
    }
    layer.add(panel);

    this._drawWalls(layer);

    const stacks = this._getStacks();
    stacks.forEach((stack, key) => {
      const [colStr, rowStr] = key.split(':');
      const col = Number(colStr);
      const row = Number(rowStr);
      const top = stack[0]!;
      const center = this._gridCenter(col, row);
      const visual = Block.createVisual(this, top.color, {
        size: EDITOR_BLOCK_SIZE,
        showQuestion: Boolean(top.is_hidden),
      });
      visual.setPosition(center.x, center.y);
      if (this.lastPlacedCell?.col === col && this.lastPlacedCell.row === row) {
        this._animatePlacedBlock(visual);
      }
      layer.add(visual);

      const zBadge = this.add.text(center.x - 35, center.y - 35, `z${top.z}`, {
        fontSize: '14px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0, 0);
      layer.add(zBadge);

      if (stack.length > 1) {
        const badgeBg = this.add.circle(center.x + 32, center.y + 32, 18, 0x000000, 0.72);
        const badgeText = this.add.text(center.x + 32, center.y + 32, `+${stack.length - 1}`, {
          fontSize: '18px', color: '#ffffff', fontStyle: 'bold',
        }).setOrigin(0.5);
        layer.add([badgeBg, badgeText]);
      }
    });

    this._drawHoverCell(layer);

    for (let row = 0; row < this.editorState.gridRows; row += 1) {
      for (let col = 0; col < this.editorState.gridCols; col += 1) {
        const center = this._gridCenter(col, row);
        const hit = this.add.rectangle(center.x, center.y, size, size, 0xffffff, 0.001);
        hit.setInteractive({ useHandCursor: true });
        hit.on('pointerover', () => {
          this.hoverCell = { col, row };
        });
        hit.on('pointerout', () => {
          if (this.hoverCell?.col === col && this.hoverCell?.row === row) {
            this.hoverCell = null;
          }
        });
        hit.on('pointerup', () => {
          if (this.dragState?.hasMoved) return;
          if (this.editorState.wallMode) {
            const placed = this.editorState.placeWall(col, row);
            if (!placed) {
              this.showToast('Cell already has a block');
              return;
            }
          } else {
            this.editorState.placeBlock(col, row);
            this.lastPlacedCell = { col, row };
          }
          this.persistState();
          this.renderAll();
        });
        layer.add(hit);
      }
    }
  }

  private _drawPalette(): void {
    const panel = EDITOR_LAYOUT.palette;
    this.root.add(this.makePanel(panel.x, panel.y, panel.width, panel.height, UI.PANEL_LIGHT));

    this.root.add(this.add.text(panel.x + panel.width / 2, panel.y + 26, 'DRAG', {
      fontSize: '22px', color: UI.DARK_TEXT, fontStyle: 'bold',
    }).setOrigin(0.5));
    this.root.add(this.add.text(panel.x + panel.width / 2, panel.y + 48, 'BLOCKS', {
      fontSize: '16px', color: UI.MUTED_TEXT, fontStyle: 'bold',
    }).setOrigin(0.5));

    COLOR_IDS.forEach((colorId, index) => {
      const x = panel.x + panel.width / 2;
      const y = panel.y + 88 + index * 63;
      const color = getColorDefinition(colorId);
      const active = this.editorState.activeColor === colorId && !this.editorState.eraseMode;
      this.root.add(this._makeDraggableColorSwatch(x, y, 60, colorId, color.hex, color.label, active));
    });
  }

  private _drawWallTile(g: Phaser.GameObjects.Graphics, cx: number, cy: number, alpha = 1): void {
    const s = EDITOR_BLOCK_SIZE;
    g.fillStyle(0x3b5c77, alpha);
    g.fillRoundedRect(cx - s / 2, cy - s / 2, s, s, 6);
    g.lineStyle(3, 0x254661, alpha < 1 ? 0.7 : 0.94);
    g.strokeRoundedRect(cx - s / 2, cy - s / 2, s, s, 6);
  }

  private _drawWalls(layer: Phaser.GameObjects.Container): void {
    if (this.editorState.walls.length === 0) return;
    const g = this.add.graphics();
    this.editorState.walls.forEach((wall) => {
      const center = this._gridCenter(wall.col, wall.row);
      this._drawWallTile(g, center.x, center.y);
    });
    layer.add(g);
  }

  private _drawWallGhost(layer: Phaser.GameObjects.Container, cx: number, cy: number, exists: boolean): void {
    const g = this.add.graphics();
    if (exists) {
      const s = EDITOR_BLOCK_SIZE;
      g.lineStyle(5, 0xff4d6d, 0.85);
      g.strokeRoundedRect(cx - s / 2, cy - s / 2, s, s, 6);
    } else {
      this._drawWallTile(g, cx, cy, 0.45);
    }
    layer.add(g);
  }

  private _drawHoverCell(layer: Phaser.GameObjects.Container): void {
    if (!this.hoverCell) return;
    const center = this._gridCenter(this.hoverCell.col, this.hoverCell.row);
    const isDragTarget = Boolean(this.dragState?.hasMoved);
    const target = this.add.graphics();
    target.lineStyle(isDragTarget ? 5 : 3, isDragTarget ? UI.ACCENT : 0xffffff, isDragTarget ? 0.9 : 0.28);
    target.strokeRoundedRect(
      center.x - EDITOR_CELL_SIZE / 2 + 6,
      center.y - EDITOR_CELL_SIZE / 2 + 6,
      EDITOR_CELL_SIZE - 12,
      EDITOR_CELL_SIZE - 12,
      16,
    );
    layer.add(target);

    if (this.editorState.eraseMode) {
      const erase = this.add.graphics();
      erase.lineStyle(5, 0xff4d6d, 0.85);
      erase.strokeRoundedRect(
        center.x - EDITOR_BLOCK_SIZE / 2,
        center.y - EDITOR_BLOCK_SIZE / 2,
        EDITOR_BLOCK_SIZE,
        EDITOR_BLOCK_SIZE,
        14,
      );
      layer.add(erase);
      return;
    }

    if (this.editorState.wallMode) {
      const exists = this.editorState.hasWallAt(this.hoverCell.col, this.hoverCell.row);
      this._drawWallGhost(layer, center.x, center.y, exists);
      return;
    }

    const ghost = Block.createVisual(this, this.editorState.activeColor, {
      size: EDITOR_BLOCK_SIZE,
      showQuestion: this.editorState.activeIsHidden,
      alpha: 0.45,
    });
    ghost.setPosition(center.x, center.y);
    layer.add(ghost);
  }

  private _drawLayerControls(): void {
    const panel = EDITOR_LAYOUT.tools;
    const centerX = panel.x + panel.width / 2;
    const y = panel.y + 88;
    this.root.add(this.makePanel(panel.x, panel.y, panel.width, panel.height, UI.PANEL_LIGHT));
    this.root.add(this.add.text(centerX, panel.y + 26, 'TOOLS', {
      fontSize: '22px', color: UI.DARK_TEXT, fontStyle: 'bold',
    }).setOrigin(0.5));
    this.root.add(this.add.text(centerX, panel.y + 52, `z=${this.editorState.activeZ}`, {
      fontSize: '20px', color: UI.DARK_TEXT, fontStyle: 'bold',
    }).setOrigin(0.5));
    this.root.add(this.makeButton(centerX, y, 56, 42, '▲', UI.PANEL_DARK, () => {
      this.editorState.setActiveZ(this.editorState.activeZ + 1);
      this.persistState();
      this.renderAll();
    }));
    this.root.add(this.makeButton(centerX, y + 52, 56, 42, '▼', UI.PANEL_DARK, () => {
      this.editorState.setActiveZ(this.editorState.activeZ - 1);
      this.persistState();
      this.renderAll();
    }));

    this.root.add(this._makeSquareSwatch(centerX, y + 118, 56, UI.PANEL, '?', this.editorState.activeIsHidden, () => {
      this.editorState.activeIsHidden = !this.editorState.activeIsHidden;
      this.persistState();
      this.renderAll();
    }));

    this._drawModeToggles(centerX, y + 184);
  }

  private _drawModeToggles(centerX: number, y: number): void {
    this.root.add(this._makeSquareSwatch(
      centerX - 30, y, 52,
      this.editorState.eraseMode ? 0xff4d6d : UI.PANEL,
      'DEL', this.editorState.eraseMode,
      () => {
        this.editorState.eraseMode = !this.editorState.eraseMode;
        if (this.editorState.eraseMode) this.editorState.wallMode = false;
        this.persistState();
        this.renderAll();
      },
    ));
    this.root.add(this._makeSquareSwatch(
      centerX + 30, y, 52,
      this.editorState.wallMode ? 0x3b5c77 : UI.PANEL,
      'WALL', this.editorState.wallMode,
      () => {
        this.editorState.wallMode = !this.editorState.wallMode;
        if (this.editorState.wallMode) this.editorState.eraseMode = false;
        this.persistState();
        this.renderAll();
      },
    ));
  }

  private _drawBoxColumnsPanel(): void {
    const { x: panelX, y: panelY, width: panelWidth, height: panelHeight } = EDITOR_LAYOUT.boxes;
    this.root.add(this.makePanel(panelX, panelY, panelWidth, panelHeight, UI.PANEL_LIGHT));
    this.root.add(this.add.text(panelX + 24, panelY + 28, 'BOX COLUMNS', {
      fontSize: '22px', color: UI.DARK_TEXT, fontStyle: 'bold',
    }).setOrigin(0, 0.5));

    const validation = this.editorState.getValidationStatus();
    const statusColor = validation.isValid ? '#287a52' : '#b24058';
    this.root.add(this.add.text(panelX + panelWidth - 24, panelY + 28, `${validation.isValid ? '✓' : '✗'} ${validation.summary}`, {
      fontSize: validation.summary.length > 18 ? '15px' : '17px',
      color: statusColor,
      fontStyle: 'bold',
    }).setOrigin(1, 0.5));

    const columns = this.editorState.toLevelData().box_columns;
    columns.forEach((column, index) => {
      const colX = panelX + 76 + index * 146;
      const labelActive = this.editorState.activeColumn === index;
      this.root.add(this.add.text(colX, panelY + 68, `COL ${column.col}`, {
        fontSize: '16px',
        color: labelActive ? '#7442ba' : UI.MUTED_TEXT,
        fontStyle: 'bold',
      }).setOrigin(0.5));

      const columnBg = this.add.rectangle(colX, panelY + 178, 92, 208, labelActive ? 0xe9ddff : 0xe4f2f8, 1);
      columnBg.setStrokeStyle(labelActive ? 3 : 2, labelActive ? UI.PRIMARY_DARK : UI.BLUE_STROKE, labelActive ? 0.8 : 0.22);
      this.root.add(columnBg);

      column.boxes.slice(0, BOX_COLUMN_MAX_BOXES).forEach((colorId, boxIndex) => {
        this._drawEditableBox(colX, panelY + 100 + boxIndex * 30, index, boxIndex, colorId);
      });

      const canAdd = column.boxes.length < BOX_COLUMN_MAX_BOXES;
      const addY = panelY + 100 + Math.min(column.boxes.length, BOX_COLUMN_MAX_BOXES) * 30;
      this.root.add(this.makeButton(colX, addY, 78, 26, '+', canAdd ? UI.PANEL_DARK : 0x8794aa, () => {
        if (!canAdd) return;
        this.editorState.setActiveColumn(index);
        this.editorState.addBoxToColumn(index);
        this.persistState();
        this.renderAll();
      }));
    });

    this.root.add(this.makeButton(panelX + 188, panelY + panelHeight - 42, 176, 46, 'AUTO FILL', UI.PANEL_DARK, () => {
      this.editorState.syncBoxColumnsToBlocks();
      this.persistState();
      this.renderAll();
    }));
    this.root.add(this.makeButton(panelX + 404, panelY + panelHeight - 42, 176, 46, 'CLEAR COL', 0x923653, () => {
      this.editorState.clearColumn(this.editorState.activeColumn);
      this.persistState();
      this.renderAll();
    }));
  }

  private _drawEditableBox(x: number, y: number, columnIndex: number, boxIndex: number, colorId: ColorId): void {
    const color = getColorDefinition(colorId);
    const box = this.add.rectangle(x, y, 78, 24, color.hex, 1);
    box.setStrokeStyle(2, 0xffffff, 0.6);
    const label = this.add.text(x, y, colorId.charAt(0).toUpperCase(), {
      fontSize: '15px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    const hit = makeWorldHitZone(this, x, y, 88, 30, null);
    let longPressTriggered = false;
    let timer: Phaser.Time.TimerEvent | null = null;
    hit.on('pointerdown', () => {
      this.editorState.setActiveColumn(columnIndex);
      longPressTriggered = false;
      timer = this.time.delayedCall(500, () => {
        longPressTriggered = true;
        this.editorState.removeBoxFromColumn(columnIndex, boxIndex);
        this.persistState();
        this.renderAll();
      });
    });
    hit.on('pointerup', () => {
      timer?.remove(false);
      timer = null;
      if (longPressTriggered) return;
      this.editorState.setBoxColor(columnIndex, boxIndex);
      this.persistState();
      this.renderAll();
    });
    hit.on('pointerout', () => {
      timer?.remove(false);
      timer = null;
    });
    this.root.add([box, label, hit]);
  }

  private _drawSpeedSlider(centerX: number, y: number): void {
    const { trackLen, min, max } = this._speedSlider;
    const trackY = y + 50;
    const value = this.editorState.conveyorSpeed;
    const t = Phaser.Math.Clamp((value - min) / (max - min), 0, 1);
    const handleX = centerX - trackLen / 2 + t * trackLen;

    this.root.add(this.add.text(centerX, y + 24, value.toFixed(2), {
      fontSize: '20px', color: UI.DARK_TEXT, fontStyle: 'bold',
    }).setOrigin(0.5));

    const track = this.add.graphics();
    track.fillStyle(UI.PANEL_DARK, 1);
    track.fillRoundedRect(centerX - trackLen / 2, trackY - 4, trackLen, 8, 4);
    track.fillStyle(UI.PRIMARY, 1);
    track.fillRoundedRect(centerX - trackLen / 2, trackY - 4, t * trackLen, 8, 4);
    this.root.add(track);

    CONVEYOR_SPEED_OPTIONS.forEach((preset) => {
      const tx = centerX - trackLen / 2 + ((preset - min) / (max - min)) * trackLen;
      const tick = this.add.graphics();
      tick.fillStyle(0xffffff, 0.55);
      tick.fillRect(tx - 1, trackY - 9, 2, 18);
      this.root.add(tick);
    });

    const handle = this.add.circle(handleX, trackY, 10, 0xffffff, 1);
    handle.setStrokeStyle(3, UI.PRIMARY, 1);
    this.root.add(handle);

    const trackHit = makeWorldHitZone(this, centerX, trackY, trackLen + 24, 32, null);
    trackHit.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.speedDrag = true;
      this._setSpeedFromPointer(pointer.x, centerX, trackLen, min, max);
    });
    this.root.add(trackHit);
  }

  private _setSpeedFromPointer(pointerWorldX: number, centerX: number, trackLen: number, min: number, max: number): void {
    const localX = pointerWorldX - EDITOR_GAME_X;
    const trackLeft = centerX - trackLen / 2;
    const t = Phaser.Math.Clamp((localX - trackLeft) / trackLen, 0, 1);
    const raw = min + t * (max - min);
    let snapped = Math.round(raw * 100) / 100;
    for (const preset of CONVEYOR_SPEED_OPTIONS) {
      if (Math.abs(snapped - preset) < 0.012) {
        snapped = preset;
        break;
      }
    }
    if (Math.abs(snapped - this.editorState.conveyorSpeed) < 0.0005) return;
    this.editorState.setConveyorSpeed(snapped);
    this.persistState();
    this.renderAll({ skipSidebars: true });
  }

  private _drawParams(): void {
    const panel = EDITOR_LAYOUT.tools;
    const centerX = panel.x + panel.width / 2;
    const y = panel.y + 348;
    this.root.add(this.add.text(centerX, y, 'SPEED', {
      fontSize: '16px', color: UI.MUTED_TEXT, fontStyle: 'bold',
    }).setOrigin(0.5));
    this._drawSpeedSlider(centerX, y);

    const checkX = centerX - 23;
    const checkY = panel.y + 460;
    const box = this.add.rectangle(checkX, checkY, 30, 30, this.editorState.gravityFlipEnabled ? UI.PRIMARY : UI.PANEL_DARK, 1);
    box.setStrokeStyle(3, 0xffffff, 0.5);
    const boxHit = makeWorldHitZone(this, checkX, checkY, 50, 50, () => {
      this.editorState.gravityFlipEnabled = !this.editorState.gravityFlipEnabled;
      this.persistState();
      this.renderAll();
    });
    this.root.add([box, boxHit]);
    this.root.add(this.add.text(checkX + 23, checkY, 'FLIP', {
      fontSize: '16px', color: UI.DARK_TEXT, fontStyle: 'bold',
    }).setOrigin(0, 0.5));

    const magnetY = panel.y + 506;
    this.root.add(this.add.text(centerX, magnetY - 22, 'MAGNET', {
      fontSize: '16px', color: UI.MUTED_TEXT, fontStyle: 'bold',
    }).setOrigin(0.5));
    this.root.add(this.makeButton(centerX - 28, magnetY, 28, 28, '-', UI.PANEL_DARK, () => {
      this.editorState.setMagnetCount(this.editorState.magnetCount - 1);
      this.persistState();
      this.renderAll();
    }));
    this.root.add(this.add.text(centerX, magnetY, String(this.editorState.magnetCount), {
      fontSize: '20px', color: UI.DARK_TEXT, fontStyle: 'bold',
    }).setOrigin(0.5));
    this.root.add(this.makeButton(centerX + 28, magnetY, 28, 28, '+', UI.PANEL_DARK, () => {
      this.editorState.setMagnetCount(this.editorState.magnetCount + 1);
      this.persistState();
      this.renderAll();
    }));
  }

  private _drawIO(): void {
    const y = EDITOR_LAYOUT.ioY;
    this.root.add(this.makeButton(104, y, 138, 54, 'EXPORT', UI.PANEL_DARK, () => this.jsonModals.showExport()));
    this.root.add(this.makeButton(256, y, 138, 54, 'AI BRIEF', UI.PANEL_DARK, () => {
      void this.briefPanel.showModal();
    }));
    this.root.add(this.makeButton(408, y, 138, 54, 'IMPORT', UI.PANEL_DARK, () => this.jsonModals.showImport()));
    this.root.add(this.makeButton(572, y, 150, 54, 'CLEAR ALL', 0x923653, () => this.jsonModals.showConfirmClear()));
    this.root.add(this.add.text(CONFIG.GAME_WIDTH / 2, y + 52, 'Export JSON is playable; AI Brief is readable design context.', {
      fontSize: '18px', color: UI.MUTED_TEXT, fontStyle: 'bold',
    }).setOrigin(0.5));
  }

  makePanel(
    x: number, y: number, width: number, height: number, fillColor: number,
  ): Phaser.GameObjects.Graphics {
    const panel = this.add.graphics();
    panel.fillStyle(fillColor, 0.94);
    panel.fillRoundedRect(x, y, width, height, 14);
    panel.lineStyle(3, UI.BLUE_STROKE, 0.28);
    panel.strokeRoundedRect(x, y, width, height, 14);
    return panel;
  }

  private _makeSquareSwatch(
    x: number, y: number, size: number, fillColor: number, label: string, active: boolean, onClick: () => void,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    const bg = this.add.graphics();
    bg.fillStyle(fillColor, 1);
    bg.fillRoundedRect(-size / 2, -size / 2, size, size, 12);
    bg.lineStyle(active ? 4 : 2, 0xffffff, active ? 1 : 0.18);
    bg.strokeRoundedRect(-size / 2, -size / 2, size, size, 12);

    const text = this.add.text(0, 0, label, {
      fontSize: label.length > 1 ? '16px' : '24px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);

    container.add([bg, text]);
    container.setSize(size, size);
    attachHitZone(this, container, size, size);
    container.on('pointerup', onClick);
    return container;
  }

  private _makeDraggableColorSwatch(
    x: number,
    y: number,
    size: number,
    colorId: ColorId,
    fillColor: number,
    label: string,
    active: boolean,
  ): Phaser.GameObjects.Container {
    const container = this._makeSquareSwatch(x, y, size, fillColor, label, active, () => {
      if (this.dragState?.hasMoved) return;
      this.editorState.activeColor = colorId;
      this.editorState.eraseMode = false;
      this.editorState.wallMode = false;
      this.persistState();
      this.renderAll();
    });

    container.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this._beginColorDrag(colorId, pointer);
    });

    return container;
  }

  private _beginColorDrag(color: ColorId, pointer: Phaser.Input.Pointer): void {
    this._clearDragPreview();
    this.editorState.activeColor = color;
    this.editorState.eraseMode = false;
    this.editorState.wallMode = false;
    const preview = Block.createVisual(this, color, {
      size: EDITOR_BLOCK_SIZE,
      showQuestion: this.editorState.activeIsHidden,
      alpha: 0.82,
    });
    preview.setPosition(pointer.x, pointer.y);
    preview.setDepth(2500);
    this.dragState = {
      color,
      preview,
      startX: pointer.x,
      startY: pointer.y,
      hasMoved: false,
      targetCell: null,
    };
  }

  private _handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.speedDrag) {
      const panel = EDITOR_LAYOUT.tools;
      const centerX = panel.x + panel.width / 2;
      const { trackLen, min, max } = this._speedSlider;
      this._setSpeedFromPointer(pointer.x, centerX, trackLen, min, max);
      return;
    }
    const drag = this.dragState;
    if (drag) {
      if (Phaser.Math.Distance.Between(drag.startX, drag.startY, pointer.x, pointer.y) > 8) {
        drag.hasMoved = true;
      }
      if (this._syncDragPreview(pointer, drag)) {
        this.hoverCell = drag.targetCell;
        this.renderAll({ skipSidebars: true });
      }
      return;
    }
    const cell = this._pointToGridCell(pointer.x, pointer.y);
    const changed =
      (cell?.col ?? null) !== (this.hoverCell?.col ?? null) ||
      (cell?.row ?? null) !== (this.hoverCell?.row ?? null);
    if (changed) {
      this.hoverCell = cell;
      this.renderAll({ skipSidebars: true });
    }
  }

  private _syncDragPreview(pointer: Phaser.Input.Pointer, drag: DragState): boolean {
    const cell = drag.hasMoved ? this._pointToGridCell(pointer.x, pointer.y) : null;
    const changedCell = drag.targetCell?.col !== cell?.col || drag.targetCell?.row !== cell?.row;
    drag.targetCell = cell;
    if (!cell) {
      drag.preview.setPosition(pointer.x, pointer.y);
      return changedCell;
    }

    const center = this._gridCenterWorld(cell.col, cell.row);
    drag.preview.setPosition(center.x, center.y);
    return changedCell;
  }

  private _handlePointerUp(pointer: Phaser.Input.Pointer): void {
    if (this.speedDrag) {
      this.speedDrag = false;
      this.renderAll();
      return;
    }
    if (!this.dragState) return;
    const drag = this.dragState;
    const cell = this._pointToGridCell(pointer.x, pointer.y);
    this._clearDragPreview();
    if (!drag.hasMoved) return;
    if (!cell) {
      this.hoverCell = null;
      this.renderAll();
      this.showToast('Drop on the grid');
      return;
    }
    this.editorState.activeColor = drag.color;
    this.editorState.eraseMode = false;
    this.editorState.placeBlock(cell.col, cell.row);
    this.lastPlacedCell = cell;
    this.persistState();
    this.renderAll();
  }

  private _clearDragPreview(): void {
    if (!this.dragState) return;
    this.dragState.preview.destroy(true);
    this.dragState = null;
  }

  makeButton(
    x: number, y: number, width: number, height: number, label: string, fillColor: number, onClick: () => void,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    const bg = this.add.graphics();
    bg.fillStyle(fillColor, 1);
    bg.fillRoundedRect(-width / 2, -height / 2, width, height, 14);
    bg.lineStyle(2, 0xffffff, 0.16);
    bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 14);

    const text = this.add.text(0, 0, label, {
      fontSize: this._buttonFontSize(width, label),
      color: fillColor === UI.PANEL || fillColor === UI.PANEL_LIGHT ? UI.DARK_TEXT : '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    container.add([bg, text]);
    container.setSize(width, height);
    attachHitZone(this, container, width, height);
    container.on('pointerover', () => this.tweens.add({ targets: container, scale: 1.04, duration: 90 }));
    container.on('pointerout', () => this.tweens.add({ targets: container, scale: 1, duration: 90 }));
    container.on('pointerdown', () => {
      this.tweens.add({ targets: container, scale: 0.96, duration: 60 });
    });
    container.on('pointerup', () => {
      if (onClick) onClick();
    });
    return container;
  }

  private _buttonFontSize(width: number, label: string): string {
    if (width <= 52 && label.length >= 4) return '14px';
    if (width <= 64) return '18px';
    return label.length > 10 ? '18px' : '20px';
  }

  private _animatePlacedBlock(target: Phaser.GameObjects.Container): void {
    target.setScale(0.74);
    this.tweens.add({
      targets: target,
      scale: 1.06,
      duration: 120,
      ease: 'Back.Out',
      onComplete: () => {
        this.tweens.add({ targets: target, scale: 1, duration: 80, ease: 'Sine.Out' });
      },
    });
  }

  makeModal(title: string, width = 720, height = 860): Phaser.GameObjects.Container {
    this.closeModal();
    const modal = this.add.container(EDITOR_CANVAS_WIDTH / 2, CONFIG.GAME_HEIGHT / 2);
    modal.setDepth(2000);

    const overlay = this.add.rectangle(0, 0, EDITOR_CANVAS_WIDTH, CONFIG.GAME_HEIGHT, 0x000000, 0.72);
    overlay.setInteractive();
    modal.add(overlay);

    const panel = this.add.rectangle(0, 0, width, height, UI.PANEL_LIGHT, 1);
    panel.setStrokeStyle(3, 0xffffff, 0.18);
    modal.add(panel);

    modal.add(this.add.text(0, -height / 2 + 45, title, {
      fontSize: width > 600 ? '38px' : '32px',
      color: UI.DARK_TEXT,
      fontStyle: 'bold',
    }).setOrigin(0.5));

    this.modal = modal;
    return modal;
  }

  closeModal(): void {
    this.activeTextInput = null;
    if (this.modal) {
      this.modal.destroy(true);
      this.modal = null;
    }
  }

  private _handleTextInput(event: KeyboardEvent): void {
    if (!this.activeTextInput) return;
    event.preventDefault();

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v') return;
    if (event.key === 'Backspace') {
      this.activeTextInput.value = this.activeTextInput.value.slice(0, -1);
    } else if (event.key === 'Enter') {
      this.activeTextInput.value += '\n';
    } else if (event.key === 'Tab') {
      this.activeTextInput.value += '  ';
    } else if (event.key.length === 1) {
      this.activeTextInput.value += event.key;
    }

    this.refreshInputText();
  }

  refreshInputText(): void {
    if (!this.activeTextInput) return;
    const value = this.activeTextInput.value;
    const display = value.length > 2600 ? `${value.slice(0, 2600)}\n...` : value;
    this.activeTextInput.text.setText(display || 'Paste or type JSON here');
    this.activeTextInput.text.setColor(value ? '#a0ffa0' : '#8f8fa8');
    this.activeTextInput.errorText?.setText('');
  }

  private _playTest(): void {
    const error = this._validateForPlayTest();
    if (error) {
      this.showToast(error);
      return;
    }

    const json = this.editorState.exportJSON();
    window._customLevelData = JSON.parse(json);
    window._editorStateSnapshot = json;
    this.scene.start('GameScene', { levelId: 99, fromEditor: true });
  }

  private _validateForPlayTest(): string | null {
    if (this.editorState.blocks.length === 0) return 'Place at least one block.';
    try {
      validateLevel(this.editorState.toLevelData());
    } catch (error) {
      return (error as Error).message;
    }
    return null;
  }

  showToast(message: string): void {
    const toast = this.add.container(EDITOR_CANVAS_WIDTH / 2, 1220);
    toast.setDepth(3000);
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.78);
    bg.fillRoundedRect(-250, -34, 500, 68, 16);
    const text = this.add.text(0, 0, message, {
      fontSize: '18px', color: '#ffffff', fontStyle: 'bold', align: 'center', wordWrap: { width: 460 },
    }).setOrigin(0.5);
    toast.add([bg, text]);
    this.time.delayedCall(1600, () => {
      this.tweens.add({
        targets: toast,
        alpha: 0,
        y: toast.y - 14,
        duration: 240,
        onComplete: () => toast.destroy(),
      });
    });
  }

  private _gridCenter(col: number, row: number): { x: number; y: number } {
    return {
      x: GRID_START.x + col * EDITOR_CELL_SIZE + EDITOR_CELL_SIZE / 2,
      y: GRID_START.y + row * EDITOR_CELL_SIZE + EDITOR_CELL_SIZE / 2,
    };
  }

  private _gridCenterWorld(col: number, row: number): { x: number; y: number } {
    const center = this._gridCenter(col, row);
    return { x: center.x + EDITOR_GAME_X, y: center.y };
  }

  private _pointToGridCell(x: number, y: number): HoverCell | null {
    const localX = x - EDITOR_GAME_X;
    const col = Math.floor((localX - GRID_START.x) / EDITOR_CELL_SIZE);
    const row = Math.floor((y - GRID_START.y) / EDITOR_CELL_SIZE);
    if (col < 0 || row < 0 || col >= this.editorState.gridCols || row >= this.editorState.gridRows) {
      return null;
    }
    return { col, row };
  }

  private _getStacks(): Map<string, BlockRecord[]> {
    const stacks = new Map<string, BlockRecord[]>();
    this.editorState.blocks.forEach((block) => {
      const key = `${block.col}:${block.row}`;
      const stack = stacks.get(key);
      if (stack) stack.push(block);
      else stacks.set(key, [block]);
    });
    stacks.forEach((stack) => stack.sort((a, b) => b.z - a.z));
    return stacks;
  }

  persistState(): void {
    window._editorStateSnapshot = this.editorState.exportJSON();
  }
}
