import { COLOR_IDS, getColorDefinition } from '../config/colors.js';
import { CONFIG, UI } from '../config/constants.js';
import { Block } from '../entities/Block.js';
import {
  analyzeLevelWithGemini,
  getGeminiApiKey,
  storeGeminiApiKey,
  type GeminiBriefReport,
} from '../services/geminiBrief.js';
import { EditorState } from '../sim/editorState.js';
import { validateLevel } from '../sim/levelLoader.js';
import type { BlockRecord, ColorId } from '../sim/types.js';
import { drawSkyBackground } from '../ui/casualStyle.js';
import { attachHitZone, makeWorldHitZone } from '../ui/hitZones.js';

const EDITOR_CELL_SIZE = 88;
const EDITOR_CANVAS_WIDTH = 1120;
const EDITOR_GAME_X = (EDITOR_CANVAS_WIDTH - CONFIG.GAME_WIDTH) / 2;
const GRID_START = {
  x: (CONFIG.GAME_WIDTH - EDITOR_CELL_SIZE * 5) / 2,
  y: 136,
} as const;
const EDITOR_BLOCK_SIZE = 66;
const CONVEYOR_SPEED_OPTIONS = [0.12, 0.16, 0.18, 0.22, 0.26] as const;
const BOX_COLUMN_MAX_BOXES = 6;
const EDITOR_LAYOUT = {
  palette: { x: -182, y: 122, width: 164, height: 536 },
  tools: { x: 738, y: 122, width: 164, height: 536 },
  boxes: { x: 64, y: 704, width: 592, height: 390 },
  ioY: 1180,
} as const;

interface HoverCell {
  col: number;
  row: number;
}

interface ActiveTextInput {
  value: string;
  text: Phaser.GameObjects.Text;
  errorText: Phaser.GameObjects.Text | null;
}

interface DragState {
  color: ColorId;
  preview: Phaser.GameObjects.Container;
  startX: number;
  startY: number;
  hasMoved: boolean;
}

declare global {
  interface Window {
    _editorStateSnapshot?: string;
  }
}

export class EditorScene extends Phaser.Scene {
  editorState!: EditorState;
  hoverCell: HoverCell | null = null;
  modal: Phaser.GameObjects.Container | null = null;
  activeTextInput: ActiveTextInput | null = null;
  dragState: DragState | null = null;
  root!: Phaser.GameObjects.Container;

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
      this.scale.setGameSize(CONFIG.GAME_WIDTH, CONFIG.GAME_HEIGHT);
    });

    this._renderAll();
  }

  private _renderAll(): void {
    if (this.root) this.root.destroy(true);
    this.root = this.add.container(EDITOR_GAME_X, 0);
    this._drawHeader();
    this._drawGrid();
    this._drawPalette();
    this._drawLayerControls();
    this._drawBoxColumnsPanel();
    this._drawParams();
    this._drawIO();
  }

  private _drawHeader(): void {
    this.root.add(this._makeButton(104, 48, 132, 50, '← MENU', UI.PANEL_DARK, () => {
      this.scene.start('MenuScene');
    }));
    this.root.add(this.add.text(CONFIG.GAME_WIDTH / 2, 48, 'LEVEL EDITOR', {
      fontSize: '28px', color: UI.TEXT, fontStyle: 'bold',
    }).setOrigin(0.5));
    this.root.add(this._makeButton(602, 48, 150, 50, 'START', UI.PRIMARY, () => this._playTest()));
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

    if (this.hoverCell) {
      const center = this._gridCenter(this.hoverCell.col, this.hoverCell.row);
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
      } else {
        const ghost = Block.createVisual(this, this.editorState.activeColor, {
          size: EDITOR_BLOCK_SIZE,
          showQuestion: this.editorState.activeIsHidden,
          alpha: 0.45,
        });
        ghost.setPosition(center.x, center.y);
        layer.add(ghost);
      }
    }

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
          this.editorState.placeBlock(col, row);
          this._persistState();
          this._renderAll();
        });
        layer.add(hit);
      }
    }
  }

  private _drawPalette(): void {
    const panel = EDITOR_LAYOUT.palette;
    this.root.add(this._makePanel(panel.x, panel.y, panel.width, panel.height, UI.PANEL_LIGHT));

    this.root.add(this.add.text(panel.x + panel.width / 2, panel.y + 26, 'DRAG', {
      fontSize: '16px', color: UI.DARK_TEXT, fontStyle: 'bold',
    }).setOrigin(0.5));
    this.root.add(this.add.text(panel.x + panel.width / 2, panel.y + 48, 'BLOCKS', {
      fontSize: '14px', color: UI.MUTED_TEXT, fontStyle: 'bold',
    }).setOrigin(0.5));

    COLOR_IDS.forEach((colorId, index) => {
      const x = panel.x + panel.width / 2;
      const y = panel.y + 88 + index * 63;
      const color = getColorDefinition(colorId);
      const active = this.editorState.activeColor === colorId && !this.editorState.eraseMode;
      this.root.add(this._makeDraggableColorSwatch(x, y, 54, colorId, color.hex, color.label, active));
    });
  }

  private _drawLayerControls(): void {
    const panel = EDITOR_LAYOUT.tools;
    const centerX = panel.x + panel.width / 2;
    const y = panel.y + 88;
    this.root.add(this._makePanel(panel.x, panel.y, panel.width, panel.height, UI.PANEL_LIGHT));
    this.root.add(this.add.text(centerX, panel.y + 26, 'TOOLS', {
      fontSize: '16px', color: UI.DARK_TEXT, fontStyle: 'bold',
    }).setOrigin(0.5));
    this.root.add(this.add.text(centerX, panel.y + 52, `z=${this.editorState.activeZ}`, {
      fontSize: '20px', color: UI.DARK_TEXT, fontStyle: 'bold',
    }).setOrigin(0.5));
    this.root.add(this._makeButton(centerX, y, 56, 42, '▲', UI.PANEL_DARK, () => {
      this.editorState.setActiveZ(this.editorState.activeZ + 1);
      this._persistState();
      this._renderAll();
    }));
    this.root.add(this._makeButton(centerX, y + 52, 56, 42, '▼', UI.PANEL_DARK, () => {
      this.editorState.setActiveZ(this.editorState.activeZ - 1);
      this._persistState();
      this._renderAll();
    }));

    this.root.add(this._makeSquareSwatch(centerX, y + 118, 56, UI.PANEL, '?', this.editorState.activeIsHidden, () => {
      this.editorState.activeIsHidden = !this.editorState.activeIsHidden;
      this._persistState();
      this._renderAll();
    }));

    this.root.add(this._makeSquareSwatch(
      centerX,
      y + 184,
      56,
      this.editorState.eraseMode ? 0xff4d6d : UI.PANEL,
      'DEL',
      this.editorState.eraseMode,
      () => {
        this.editorState.eraseMode = !this.editorState.eraseMode;
        this._persistState();
        this._renderAll();
      },
    ));
  }

  private _drawBoxColumnsPanel(): void {
    const { x: panelX, y: panelY, width: panelWidth, height: panelHeight } = EDITOR_LAYOUT.boxes;
    this.root.add(this._makePanel(panelX, panelY, panelWidth, panelHeight, UI.PANEL_LIGHT));
    this.root.add(this.add.text(panelX + 24, panelY + 28, 'BOX COLUMNS', {
      fontSize: '17px', color: UI.DARK_TEXT, fontStyle: 'bold',
    }).setOrigin(0, 0.5));

    const validation = this.editorState.getValidationStatus();
    const statusColor = validation.isValid ? '#287a52' : '#b24058';
    this.root.add(this.add.text(panelX + panelWidth - 24, panelY + 28, `${validation.isValid ? '✓' : '✗'} ${validation.summary}`, {
      fontSize: validation.summary.length > 18 ? '12px' : '14px',
      color: statusColor,
      fontStyle: 'bold',
    }).setOrigin(1, 0.5));

    const columns = this.editorState.toLevelData().box_columns;
    columns.forEach((column, index) => {
      const colX = panelX + 76 + index * 146;
      const labelActive = this.editorState.activeColumn === index;
      this.root.add(this.add.text(colX, panelY + 68, `COL ${column.col}`, {
        fontSize: '13px',
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
      this.root.add(this._makeButton(colX, addY, 78, 26, '+', canAdd ? UI.PANEL_DARK : 0x8794aa, () => {
        if (!canAdd) return;
        this.editorState.setActiveColumn(index);
        this.editorState.addBoxToColumn(index);
        this._persistState();
        this._renderAll();
      }));
    });

    this.root.add(this._makeButton(panelX + 188, panelY + panelHeight - 42, 176, 46, 'AUTO FILL', UI.PANEL_DARK, () => {
      this.editorState.syncBoxColumnsToBlocks();
      this._persistState();
      this._renderAll();
    }));
    this.root.add(this._makeButton(panelX + 404, panelY + panelHeight - 42, 176, 46, 'CLEAR COL', 0x923653, () => {
      this.editorState.clearColumn(this.editorState.activeColumn);
      this._persistState();
      this._renderAll();
    }));
  }

  private _drawEditableBox(x: number, y: number, columnIndex: number, boxIndex: number, colorId: ColorId): void {
    const color = getColorDefinition(colorId);
    const box = this.add.rectangle(x, y, 78, 24, color.hex, 1);
    box.setStrokeStyle(2, 0xffffff, 0.6);
    const label = this.add.text(x, y, colorId.charAt(0).toUpperCase(), {
      fontSize: '13px', color: '#ffffff', fontStyle: 'bold',
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
        this._persistState();
        this._renderAll();
      });
    });
    hit.on('pointerup', () => {
      timer?.remove(false);
      timer = null;
      if (longPressTriggered) return;
      this.editorState.setBoxColor(columnIndex, boxIndex);
      this._persistState();
      this._renderAll();
    });
    hit.on('pointerout', () => {
      timer?.remove(false);
      timer = null;
    });
    this.root.add([box, label, hit]);
  }

  private _drawParams(): void {
    const panel = EDITOR_LAYOUT.tools;
    const centerX = panel.x + panel.width / 2;
    const y = panel.y + 348;
    this.root.add(this.add.text(centerX, y, 'SPEED', {
      fontSize: '14px', color: UI.MUTED_TEXT, fontStyle: 'bold',
    }).setOrigin(0.5));

    CONVEYOR_SPEED_OPTIONS.forEach((value, index) => {
      const x = centerX + (index % 2 === 0 ? -21 : 21);
      const rowY = y + 32 + Math.floor(index / 2) * 34;
      const active = Math.abs(this.editorState.conveyorSpeed - value) < 0.001;
      this.root.add(this._makeButton(x, rowY, 40, 28, value.toFixed(2), active ? UI.PRIMARY : UI.PANEL_DARK, () => {
        this.editorState.setConveyorSpeed(value);
        this._persistState();
        this._renderAll();
      }));
    });

    const checkX = centerX - 23;
    const checkY = panel.y + 460;
    const box = this.add.rectangle(checkX, checkY, 30, 30, this.editorState.gravityFlipEnabled ? UI.PRIMARY : UI.PANEL_DARK, 1);
    box.setStrokeStyle(3, 0xffffff, 0.5);
    const boxHit = makeWorldHitZone(this, checkX, checkY, 50, 50, () => {
      this.editorState.gravityFlipEnabled = !this.editorState.gravityFlipEnabled;
      this._persistState();
      this._renderAll();
    });
    this.root.add([box, boxHit]);
    this.root.add(this.add.text(checkX + 23, checkY, 'FLIP', {
      fontSize: '14px', color: UI.DARK_TEXT, fontStyle: 'bold',
    }).setOrigin(0, 0.5));

    const magnetY = panel.y + 506;
    this.root.add(this.add.text(centerX, magnetY - 22, 'MAGNET', {
      fontSize: '13px', color: UI.MUTED_TEXT, fontStyle: 'bold',
    }).setOrigin(0.5));
    this.root.add(this._makeButton(centerX - 28, magnetY, 28, 28, '-', UI.PANEL_DARK, () => {
      this.editorState.setMagnetCount(this.editorState.magnetCount - 1);
      this._persistState();
      this._renderAll();
    }));
    this.root.add(this.add.text(centerX, magnetY, String(this.editorState.magnetCount), {
      fontSize: '20px', color: UI.DARK_TEXT, fontStyle: 'bold',
    }).setOrigin(0.5));
    this.root.add(this._makeButton(centerX + 28, magnetY, 28, 28, '+', UI.PANEL_DARK, () => {
      this.editorState.setMagnetCount(this.editorState.magnetCount + 1);
      this._persistState();
      this._renderAll();
    }));
  }

  private _drawIO(): void {
    const y = EDITOR_LAYOUT.ioY;
    this.root.add(this._makeButton(104, y, 138, 54, 'EXPORT', UI.PANEL_DARK, () => this._showExportModal()));
    this.root.add(this._makeButton(256, y, 138, 54, 'AI BRIEF', UI.PANEL_DARK, () => this._showAgentBriefModal()));
    this.root.add(this._makeButton(408, y, 138, 54, 'IMPORT', UI.PANEL_DARK, () => this._showImportModal()));
    this.root.add(this._makeButton(572, y, 150, 54, 'CLEAR ALL', 0x923653, () => this._showConfirmClear()));
    this.root.add(this.add.text(CONFIG.GAME_WIDTH / 2, y + 52, 'Export JSON is playable; AI Brief is readable design context.', {
      fontSize: '16px', color: UI.MUTED_TEXT, fontStyle: 'bold',
    }).setOrigin(0.5));
  }

  private _makePanel(
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
      this._persistState();
      this._renderAll();
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
    };
  }

  private _handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.dragState) return;
    const drag = this.dragState;
    drag.preview.setPosition(pointer.x, pointer.y);
    if (Phaser.Math.Distance.Between(drag.startX, drag.startY, pointer.x, pointer.y) > 8) {
      drag.hasMoved = true;
    }
  }

  private _handlePointerUp(pointer: Phaser.Input.Pointer): void {
    if (!this.dragState) return;
    const drag = this.dragState;
    const cell = this._pointToGridCell(pointer.x, pointer.y);
    this._clearDragPreview();
    if (!drag.hasMoved || !cell) return;
    this.editorState.activeColor = drag.color;
    this.editorState.eraseMode = false;
    this.editorState.placeBlock(cell.col, cell.row);
    this._persistState();
    this._renderAll();
  }

  private _clearDragPreview(): void {
    if (!this.dragState) return;
    this.dragState.preview.destroy(true);
    this.dragState = null;
  }

  private _makeButton(
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

  private _showExportModal(): void {
    const json = this.editorState.exportJSON();
    const modal = this._makeModal('Exported JSON');
    const display = json.length > 2600 ? `${json.slice(0, 2600)}\n...` : json;
    const outputBg = this.add.rectangle(0, -40, 540, 520, 0x151522, 1);
    outputBg.setStrokeStyle(2, 0xffffff, 0.14);
    modal.add(outputBg);
    const text = this.add.text(-270, -275, display, {
      fontSize: '13px', color: '#a0ffa0', fontStyle: 'bold', wordWrap: { width: 540 },
    }).setOrigin(0, 0);
    modal.add(text);

    modal.add(this._makeButton(-115, 336, 190, 58, 'COPY', UI.PRIMARY, async () => {
      try {
        await navigator.clipboard.writeText(json);
        this._showToast('Copied JSON');
      } catch {
        this._showToast('Clipboard unavailable');
      }
    }));
    modal.add(this._makeButton(115, 336, 190, 58, 'CLOSE', UI.PANEL_DARK, () => this._closeModal()));
  }

  private _showImportModal(): void {
    const modal = this._makeModal('Import JSON');
    const inputBg = this.add.rectangle(0, -40, 540, 520, 0x151522, 1);
    inputBg.setStrokeStyle(2, 0xffffff, 0.14);
    modal.add(inputBg);

    const inputText = this.add.text(-255, -285, 'Paste or type JSON here', {
      fontSize: '13px', color: '#8f8fa8', fontStyle: 'bold', wordWrap: { width: 510 },
    }).setOrigin(0, 0);
    modal.add(inputText);

    const errorText = this.add.text(0, 244, '', {
      fontSize: '15px', color: '#ff9a9a', fontStyle: 'bold', align: 'center', wordWrap: { width: 520 },
    }).setOrigin(0.5);
    modal.add(errorText);

    const inputState: ActiveTextInput = { value: '', text: inputText, errorText };
    inputBg.setInteractive({ useHandCursor: true });
    inputBg.on('pointerdown', () => {
      this.activeTextInput = inputState;
      this._refreshInputText();
    });
    this.activeTextInput = inputState;

    modal.add(this._makeButton(-205, 336, 150, 58, 'PASTE', UI.PANEL_DARK, async () => {
      try {
        if (!this.activeTextInput) return;
        this.activeTextInput.value = await navigator.clipboard.readText();
        this._refreshInputText();
      } catch {
        errorText.setText('Clipboard read failed.');
      }
    }));

    modal.add(this._makeButton(0, 336, 150, 58, 'LOAD', UI.PRIMARY, () => {
      try {
        if (!this.activeTextInput) return;
        this.editorState.importJSON(this.activeTextInput.value);
        this._persistState();
        this._closeModal();
        this._renderAll();
        this._showToast('Imported JSON');
      } catch (error) {
        errorText.setText((error as Error).message);
      }
    }));

    modal.add(this._makeButton(205, 336, 150, 58, 'CLOSE', UI.PANEL_DARK, () => this._closeModal()));
  }

  private async _showAgentBriefModal(): Promise<void> {
    const brief = this.editorState.getAgentBrief();
    const modal = this._makeModal('AI Level Brief');
    const copyState = { text: brief };
    const status = this.add.text(0, -310, '', {
      fontSize: '16px', color: UI.MUTED_TEXT, fontStyle: 'bold', align: 'center', wordWrap: { width: 520 },
    }).setOrigin(0.5);
    const content = this.add.text(-260, -270, brief, {
      fontSize: '16px', color: UI.DARK_TEXT, fontStyle: 'bold', wordWrap: { width: 520 },
    }).setOrigin(0, 0);
    modal.add([status, content]);

    const runAnalysis = () => this._runGeminiBriefAnalysis(brief, status, content, copyState);
    this._addAgentBriefButtons(modal, status, copyState, runAnalysis);
    await runAnalysis();
  }

  private _addAgentBriefButtons(
    modal: Phaser.GameObjects.Container,
    status: Phaser.GameObjects.Text,
    copyState: { text: string },
    runAnalysis: () => Promise<void>,
  ): void {
    modal.add(this._makeButton(-230, 336, 124, 58, 'SET KEY', UI.PANEL_DARK, () => {
      const apiKey = window.prompt('Gemini API key');
      if (!apiKey) return;
      storeGeminiApiKey(apiKey);
      status.setText('Gemini API key saved locally.');
    }));
    modal.add(this._makeButton(-76, 336, 124, 58, 'RUN', UI.PRIMARY, () => {
      void runAnalysis();
    }));
    modal.add(this._makeButton(76, 336, 124, 58, 'COPY', UI.PANEL_DARK, async () => {
      try {
        await navigator.clipboard.writeText(copyState.text);
        this._showToast('Copied AI brief');
      } catch {
        this._showToast('Clipboard unavailable');
      }
    }));
    modal.add(this._makeButton(230, 336, 124, 58, 'CLOSE', UI.PANEL_DARK, () => this._closeModal()));
  }

  private async _runGeminiBriefAnalysis(
    brief: string,
    status: Phaser.GameObjects.Text,
    content: Phaser.GameObjects.Text,
    copyState: { text: string },
  ): Promise<void> {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      status.setText('Missing Gemini API key. Set VITE_GEMINI_API_KEY or use SET KEY.');
      return;
    }

    status.setText('Analyzing with gemini-3-flash-preview...');
    try {
      const report = await analyzeLevelWithGemini(
        this.editorState.toLevelData(),
        this.editorState.getValidationStatus(),
        brief,
        apiKey,
        {
          onDelta: (text) => {
            copyState.text = text;
            content.setText(text);
            status.setText('Streaming structured AI brief...');
          },
        },
      );
      copyState.text = JSON.stringify(report, null, 2);
      content.setText(this._formatGeminiBrief(report));
      status.setText('Structured AI brief ready.');
    } catch (error) {
      status.setText((error as Error).message);
    }
  }

  private _formatGeminiBrief(report: GeminiBriefReport): string {
    const roles = report.roleReviews
      .map((review) => `${this._roleLabel(review.role)} [${review.severity}]: ${review.finding}`)
      .join('\n');
    const stuck = report.likelyStuckPoints.map((item) => `- ${item}`).join('\n') || '- No clear stuck points.';
    const changes = report.recommendedChanges
      .map((item) => `- ${item.priority}: ${item.change} (${item.reason})`)
      .join('\n') || '- None.';

    return [
      `Verdict: ${report.verdict} / ${report.progressionPlacement} / difficulty ${report.difficultyScore}/10`,
      `Confidence: ${Math.round(report.confidence * 100)}%`,
      '',
      report.teamSummary,
      '',
      `Solvability: ${report.solvability.status}`,
      report.solvability.reason,
      '',
      'Team review:',
      roles,
      '',
      'Likely stuck points:',
      stuck,
      '',
      'Recommended changes:',
      changes,
    ].join('\n');
  }

  private _roleLabel(role: GeminiBriefReport['roleReviews'][number]['role']): string {
    return {
      level_designer: 'Level Designer',
      gameplay_tester: 'Gameplay Tester',
      product_manager: 'Product Manager',
      balancing_critic: 'Balancing Critic',
      iteration_partner: 'Iteration Partner',
    }[role];
  }

  private _showConfirmClear(): void {
    const modal = this._makeModal('Clear All?');
    modal.add(this.add.text(0, -40, 'Remove all blocks from the editor?', {
      fontSize: '24px', color: UI.DARK_TEXT, fontStyle: 'bold', align: 'center', wordWrap: { width: 480 },
    }).setOrigin(0.5));
    modal.add(this._makeButton(-120, 125, 190, 62, 'CLEAR', 0x923653, () => {
      this.editorState.clear();
      this._persistState();
      this._closeModal();
      this._renderAll();
    }));
    modal.add(this._makeButton(120, 125, 190, 62, 'CANCEL', UI.PANEL_DARK, () => this._closeModal()));
  }

  private _makeModal(title: string): Phaser.GameObjects.Container {
    this._closeModal();
    const modal = this.add.container(EDITOR_CANVAS_WIDTH / 2, CONFIG.GAME_HEIGHT / 2);
    modal.setDepth(2000);

    const overlay = this.add.rectangle(0, 0, EDITOR_CANVAS_WIDTH, CONFIG.GAME_HEIGHT, 0x000000, 0.72);
    overlay.setInteractive();
    modal.add(overlay);

    const panel = this.add.rectangle(0, 0, 600, 820, UI.PANEL_LIGHT, 1);
    panel.setStrokeStyle(3, 0xffffff, 0.18);
    modal.add(panel);

    modal.add(this.add.text(0, -365, title, { fontSize: '32px', color: UI.DARK_TEXT, fontStyle: 'bold' }).setOrigin(0.5));

    this.modal = modal;
    return modal;
  }

  private _closeModal(): void {
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

    this._refreshInputText();
  }

  private _refreshInputText(): void {
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
      this._showToast(error);
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

  private _showToast(message: string): void {
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

  private _persistState(): void {
    window._editorStateSnapshot = this.editorState.exportJSON();
  }
}
