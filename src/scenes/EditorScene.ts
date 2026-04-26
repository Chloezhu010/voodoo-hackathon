import { COLOR_IDS, getColorDefinition } from '../config/colors.js';
import { CONFIG, UI } from '../config/constants.js';
import { Block } from '../entities/Block.js';
import { EditorState } from '../sim/editorState.js';
import { validateLevel } from '../sim/levelLoader.js';
import type { BlockRecord, ColorId } from '../sim/types.js';
import { drawSkyBackground } from '../ui/casualStyle.js';
import { attachHitZone, makeWorldHitZone } from '../ui/hitZones.js';

const EDITOR_CELL_SIZE = 88;
const GRID_START = {
  x: (CONFIG.GAME_WIDTH - EDITOR_CELL_SIZE * 5) / 2,
  y: 136,
} as const;
const EDITOR_BLOCK_SIZE = 66;
const CONVEYOR_SPEED_OPTIONS = [0.12, 0.16, 0.18, 0.22, 0.26] as const;
const BOX_COLUMN_MAX_BOXES = 6;
const EDITOR_LAYOUT = {
  palette: { x: 40, y: 590, width: 640, height: 150 },
  workbench: { x: 40, y: 766, width: 640, height: 348 },
  tools: { x: 70, y: 796, width: 258, height: 286 },
  boxes: { x: 370, y: 796, width: 280, height: 286 },
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
  root!: Phaser.GameObjects.Container;

  constructor() {
    super('EditorScene');
  }

  create(): void {
    drawSkyBackground(this);
    this.editorState = new EditorState();
    this.hoverCell = null;
    this.modal = null;
    this.activeTextInput = null;

    if (window._editorStateSnapshot) {
      try {
        this.editorState.importJSON(window._editorStateSnapshot);
      } catch (error) {
        console.warn('Could not restore editor state:', error);
      }
    }

    this.input.keyboard?.on('keydown', this._handleTextInput, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown', this._handleTextInput, this);
    });

    this._renderAll();
  }

  private _renderAll(): void {
    if (this.root) this.root.destroy(true);
    this.root = this.add.container(0, 0);
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
    this.root.add(this._makeButton(602, 48, 150, 50, 'PLAY TEST', UI.PRIMARY, () => this._playTest()));
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

    const y = panel.y + 92;
    const buttonSize = 62;
    const gap = 8;
    const total = COLOR_IDS.length + 2;
    const startX = (CONFIG.GAME_WIDTH - total * buttonSize - (total - 1) * gap) / 2 + buttonSize / 2;

    this.root.add(this.add.text(CONFIG.GAME_WIDTH / 2, panel.y + 28, 'COLOR PALETTE', {
      fontSize: '18px', color: UI.DARK_TEXT, fontStyle: 'bold',
    }).setOrigin(0.5));

    COLOR_IDS.forEach((colorId, index) => {
      const x = startX + index * (buttonSize + gap);
      const color = getColorDefinition(colorId);
      const active = this.editorState.activeColor === colorId && !this.editorState.eraseMode;
      const button = this._makeSquareSwatch(x, y, buttonSize, color.hex, color.label, active, () => {
        this.editorState.activeColor = colorId;
        this.editorState.eraseMode = false;
        this._persistState();
        this._renderAll();
      });
      this.root.add(button);
    });

    const hiddenX = startX + COLOR_IDS.length * (buttonSize + gap);
    this.root.add(this._makeSquareSwatch(hiddenX, y, buttonSize, UI.PANEL, '?', this.editorState.activeIsHidden, () => {
      this.editorState.activeIsHidden = !this.editorState.activeIsHidden;
      this._persistState();
      this._renderAll();
    }));

    const eraseX = hiddenX + buttonSize + gap;
    this.root.add(this._makeSquareSwatch(
      eraseX, y, buttonSize,
      this.editorState.eraseMode ? 0xff4d6d : UI.PANEL,
      'DEL', this.editorState.eraseMode,
      () => {
        this.editorState.eraseMode = !this.editorState.eraseMode;
        this._persistState();
        this._renderAll();
      },
    ));
  }

  private _drawLayerControls(): void {
    const panel = EDITOR_LAYOUT.tools;
    const workbench = EDITOR_LAYOUT.workbench;
    const y = panel.y + 48;
    this.root.add(this._makePanel(workbench.x, workbench.y, workbench.width, workbench.height, UI.PANEL_LIGHT));
    const divider = this.add.graphics();
    divider.lineStyle(2, UI.BLUE_STROKE, 0.18);
    divider.lineBetween(350, workbench.y + 28, 350, workbench.y + workbench.height - 28);
    this.root.add(divider);
    this.root.add(this.add.text(panel.x, panel.y, 'TOOLS', {
      fontSize: '18px', color: UI.DARK_TEXT, fontStyle: 'bold',
    }).setOrigin(0, 0.5));
    this.root.add(this.add.text(panel.x, y, 'Z-LAYER', { fontSize: '16px', color: UI.MUTED_TEXT, fontStyle: 'bold' }).setOrigin(0, 0.5));
    this.root.add(this._makeButton(panel.x + 118, y, 52, 44, '▼', UI.PANEL_DARK, () => {
      this.editorState.setActiveZ(this.editorState.activeZ - 1);
      this._persistState();
      this._renderAll();
    }));
    this.root.add(this.add.text(panel.x + 176, y, `z=${this.editorState.activeZ}`, { fontSize: '20px', color: UI.DARK_TEXT, fontStyle: 'bold' }).setOrigin(0.5));
    this.root.add(this._makeButton(panel.x + 234, y, 52, 44, '▲', UI.PANEL_DARK, () => {
      this.editorState.setActiveZ(this.editorState.activeZ + 1);
      this._persistState();
      this._renderAll();
    }));

    this.root.add(this.add.text(panel.x, y + 40, 'Higher z appears on top.', {
      fontSize: '15px', color: UI.MUTED_TEXT, fontStyle: 'bold',
    }).setOrigin(0, 0.5));
  }

  private _drawBoxColumnsPanel(): void {
    const { x: panelX, y: panelY, width: panelWidth, height: panelHeight } = EDITOR_LAYOUT.boxes;
    this.root.add(this.add.text(panelX, panelY, 'BOX COLUMNS', {
      fontSize: '17px', color: UI.DARK_TEXT, fontStyle: 'bold',
    }).setOrigin(0, 0.5));

    const validation = this.editorState.getValidationStatus();
    const statusColor = validation.isValid ? '#287a52' : '#b24058';
    this.root.add(this.add.text(panelX + panelWidth, panelY, `${validation.isValid ? '✓' : '✗'} ${validation.summary}`, {
      fontSize: validation.summary.length > 18 ? '12px' : '14px',
      color: statusColor,
      fontStyle: 'bold',
    }).setOrigin(1, 0.5));

    const columns = this.editorState.toLevelData().box_columns;
    columns.forEach((column, index) => {
      const colX = panelX + 34 + index * 70;
      const labelActive = this.editorState.activeColumn === index;
      this.root.add(this.add.text(colX, panelY + 38, `COL ${column.col}`, {
        fontSize: '13px',
        color: labelActive ? '#7442ba' : UI.MUTED_TEXT,
        fontStyle: 'bold',
      }).setOrigin(0.5));

      const columnBg = this.add.rectangle(colX, panelY + 142, 56, 190, labelActive ? 0xe9ddff : 0xe4f2f8, 1);
      columnBg.setStrokeStyle(labelActive ? 3 : 2, labelActive ? UI.PRIMARY_DARK : UI.BLUE_STROKE, labelActive ? 0.8 : 0.22);
      this.root.add(columnBg);

      column.boxes.slice(0, BOX_COLUMN_MAX_BOXES).forEach((colorId, boxIndex) => {
        this._drawEditableBox(colX, panelY + 68 + boxIndex * 28, index, boxIndex, colorId);
      });

      const canAdd = column.boxes.length < BOX_COLUMN_MAX_BOXES;
      const addY = panelY + 68 + Math.min(column.boxes.length, BOX_COLUMN_MAX_BOXES) * 28;
      this.root.add(this._makeButton(colX, addY, 52, 24, '+', canAdd ? UI.PANEL_DARK : 0x8794aa, () => {
        if (!canAdd) return;
        this.editorState.setActiveColumn(index);
        this.editorState.addBoxToColumn(index);
        this._persistState();
        this._renderAll();
      }));
    });

    this.root.add(this._makeButton(panelX + 70, panelY + panelHeight - 22, 128, 42, 'AUTO FILL', UI.PANEL_DARK, () => {
      this.editorState.syncBoxColumnsToBlocks();
      this._persistState();
      this._renderAll();
    }));
    this.root.add(this._makeButton(panelX + 212, panelY + panelHeight - 22, 128, 42, 'CLEAR COL', 0x923653, () => {
      this.editorState.clearColumn(this.editorState.activeColumn);
      this._persistState();
      this._renderAll();
    }));
  }

  private _drawEditableBox(x: number, y: number, columnIndex: number, boxIndex: number, colorId: ColorId): void {
    const color = getColorDefinition(colorId);
    const box = this.add.rectangle(x, y, 54, 22, color.hex, 1);
    box.setStrokeStyle(2, 0xffffff, 0.6);
    const label = this.add.text(x, y, colorId.charAt(0).toUpperCase(), {
      fontSize: '13px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    const hit = makeWorldHitZone(this, x, y, 64, 28, null);
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
    const y = panel.y + 126;
    this.root.add(this.add.text(panel.x, y, 'CONVEYOR', { fontSize: '16px', color: UI.MUTED_TEXT, fontStyle: 'bold' }).setOrigin(0, 0.5));

    CONVEYOR_SPEED_OPTIONS.forEach((value, index) => {
      const x = panel.x + 24 + index * 52;
      const active = Math.abs(this.editorState.conveyorSpeed - value) < 0.001;
      this.root.add(this._makeButton(x, y + 38, 48, 38, value.toFixed(2), active ? UI.PRIMARY : UI.PANEL_DARK, () => {
        this.editorState.setConveyorSpeed(value);
        this._persistState();
        this._renderAll();
      }));
    });

    const checkX = panel.x + 18;
    const checkY = y + 86;
    const box = this.add.rectangle(checkX, checkY, 30, 30, this.editorState.gravityFlipEnabled ? UI.PRIMARY : UI.PANEL_DARK, 1);
    box.setStrokeStyle(3, 0xffffff, 0.5);
    const boxHit = makeWorldHitZone(this, checkX, checkY, 50, 50, () => {
      this.editorState.gravityFlipEnabled = !this.editorState.gravityFlipEnabled;
      this._persistState();
      this._renderAll();
    });
    this.root.add([box, boxHit]);
    this.root.add(this.add.text(checkX + 26, checkY, 'GRAV FLIP', { fontSize: '16px', color: UI.DARK_TEXT, fontStyle: 'bold' }).setOrigin(0, 0.5));

    const magnetY = y + 128;
    this.root.add(this.add.text(panel.x, magnetY, 'MAGNET', { fontSize: '16px', color: UI.MUTED_TEXT, fontStyle: 'bold' }).setOrigin(0, 0.5));
    this.root.add(this._makeButton(panel.x + 116, magnetY, 48, 40, '-', UI.PANEL_DARK, () => {
      this.editorState.setMagnetCount(this.editorState.magnetCount - 1);
      this._persistState();
      this._renderAll();
    }));
    this.root.add(this.add.text(panel.x + 174, magnetY, String(this.editorState.magnetCount), { fontSize: '22px', color: UI.DARK_TEXT, fontStyle: 'bold' }).setOrigin(0.5));
    this.root.add(this._makeButton(panel.x + 232, magnetY, 48, 40, '+', UI.PANEL_DARK, () => {
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

  private _showAgentBriefModal(): void {
    const brief = this.editorState.getAgentBrief();
    const modal = this._makeModal('AI Level Brief');
    modal.add(this.add.text(-260, -260, brief, {
      fontSize: '18px', color: UI.DARK_TEXT, fontStyle: 'bold', wordWrap: { width: 520 },
    }).setOrigin(0, 0));
    modal.add(this.add.text(-260, 120, this.editorState.exportJSON(), {
      fontSize: '12px', color: '#4d668f', fontStyle: 'bold', wordWrap: { width: 520 },
    }).setOrigin(0, 0));
    modal.add(this._makeButton(-115, 336, 190, 58, 'COPY', UI.PRIMARY, async () => {
      try {
        await navigator.clipboard.writeText(`${brief}\n\n${this.editorState.exportJSON()}`);
        this._showToast('Copied AI brief');
      } catch {
        this._showToast('Clipboard unavailable');
      }
    }));
    modal.add(this._makeButton(115, 336, 190, 58, 'CLOSE', UI.PANEL_DARK, () => this._closeModal()));
  }

  private _showConfirmClear(): void {
    const modal = this._makeModal('Clear All?');
    modal.add(this.add.text(0, -40, 'Remove all blocks from the editor?', {
      fontSize: '24px', color: UI.TEXT, fontStyle: 'bold', align: 'center', wordWrap: { width: 480 },
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
    const modal = this.add.container(CONFIG.GAME_WIDTH / 2, CONFIG.GAME_HEIGHT / 2);
    modal.setDepth(2000);

    const overlay = this.add.rectangle(0, 0, CONFIG.GAME_WIDTH, CONFIG.GAME_HEIGHT, 0x000000, 0.72);
    overlay.setInteractive();
    modal.add(overlay);

    const panel = this.add.rectangle(0, 0, 600, 820, UI.PANEL, 1);
    panel.setStrokeStyle(3, 0xffffff, 0.18);
    modal.add(panel);

    modal.add(this.add.text(0, -365, title, { fontSize: '32px', color: UI.TEXT, fontStyle: 'bold' }).setOrigin(0.5));

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
    const toast = this.add.container(CONFIG.GAME_WIDTH / 2, 1220);
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
