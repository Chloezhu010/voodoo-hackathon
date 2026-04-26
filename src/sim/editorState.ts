import { COLOR_IDS } from '../config/colors.js';

import type { BlockRecord, BoxColumn, ColorId, IdGen, LevelData, TrayConfig, WallCell } from './types.js';

export interface EditorValidationMismatch {
  color: ColorId;
  marbles: number;
  slots: number;
}

export interface EditorValidationStatus {
  totalMarbles: number;
  totalBoxCapacity: number;
  totalsMatch: boolean;
  colorMismatch: EditorValidationMismatch[];
  isValid: boolean;
  summary: string;
}

interface DefaultIdGen {
  (): string;
  _n?: number;
}

const defaultIdGen: DefaultIdGen = () => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `b_${globalThis.crypto.randomUUID()}`;
  }
  defaultIdGen._n = (defaultIdGen._n ?? 0) + 1;
  return `b_fallback_${defaultIdGen._n}`;
};

export interface EditorStateOptions {
  idGen?: IdGen;
}

/**
 * Headless editor state. No Phaser, no DOM, no wall-clock, no Math.random.
 * Inject `idGen` for deterministic tests.
 */
export class EditorState {
  private readonly _idGen: IdGen;
  gridCols = 5;
  gridRows = 5;
  blocks: BlockRecord[] = [];
  walls: WallCell[] = [];
  trays: TrayConfig[] = [];
  boxColumns: BoxColumn[];
  conveyorSpeed = 0.18;
  gravityFlipEnabled = false;
  magnetCount = 0;

  activeColor: ColorId = 'pink';
  activeZ = 0;
  activeIsHidden = false;
  eraseMode = false;
  wallMode = false;
  activeColumn = 0;

  constructor({ idGen = defaultIdGen }: EditorStateOptions = {}) {
    this._idGen = idGen;
    this.boxColumns = this._emptyBoxColumns();
  }

  placeBlock(col: number, row: number): void {
    if (this.eraseMode) {
      this.removeBlock(col, row);
      return;
    }

    if (this.hasWallAt(col, row)) return;

    const existing = this.blocks.find(
      (block) => block.col === col && block.row === row && block.z === this.activeZ,
    );

    if (existing) {
      existing.color = this.activeColor;
      existing.is_hidden = this.activeIsHidden;
      existing.starts_concealed = false;
      delete existing.revealed_by;
      this.syncBoxColumnsToBlocks();
      return;
    }

    this.blocks.push({
      id: this._idGen(),
      col,
      row,
      z: this.activeZ,
      color: this.activeColor,
      is_hidden: this.activeIsHidden,
      starts_concealed: false,
    });
    this.syncBoxColumnsToBlocks();
  }

  removeBlock(col: number, row: number): void {
    const stack = this.blocks
      .filter((block) => block.col === col && block.row === row)
      .sort((a, b) => b.z - a.z);
    if (stack.length === 0) return;
    const top = stack[0]!;
    this.blocks = this.blocks.filter((block) => block.id !== top.id);
    this.syncBoxColumnsToBlocks();
  }

  hasWallAt(col: number, row: number): boolean {
    return this.walls.some((wall) => wall.col === col && wall.row === row);
  }

  hasBlockAt(col: number, row: number): boolean {
    return this.blocks.some((block) => block.col === col && block.row === row);
  }

  placeWall(col: number, row: number): boolean {
    if (this.eraseMode || this.hasWallAt(col, row)) {
      this.removeWall(col, row);
      return true;
    }
    // Walls and blocks must not share a cell — coverage logic treats both as blocking.
    if (this.hasBlockAt(col, row)) return false;
    this.walls.push({ col, row });
    return true;
  }

  removeWall(col: number, row: number): void {
    this.walls = this.walls.filter((wall) => !(wall.col === col && wall.row === row));
  }

  setConveyorSpeed(value: number): void {
    this.conveyorSpeed = Math.max(0.08, Math.min(0.4, value));
  }

  setActiveZ(value: number): void {
    this.activeZ = Math.max(0, Math.min(2, value));
  }

  setMagnetCount(value: number): void {
    this.magnetCount = Math.max(0, Math.min(3, value));
  }

  setActiveColumn(value: number): void {
    this.activeColumn = Math.max(0, Math.min(3, value));
  }

  addBoxToColumn(columnIndex: number, color: ColorId = this.activeColor): void {
    const column = this.boxColumns[columnIndex];
    if (!column || column.boxes.length >= 6) return;
    column.boxes.push(color);
  }

  removeBoxFromColumn(columnIndex: number, boxIndex: number): void {
    const column = this.boxColumns[columnIndex];
    if (!column || boxIndex < 0 || boxIndex >= column.boxes.length) return;
    column.boxes.splice(boxIndex, 1);
  }

  setBoxColor(columnIndex: number, boxIndex: number, color: ColorId = this.activeColor): void {
    const column = this.boxColumns[columnIndex];
    if (!column || boxIndex < 0 || boxIndex >= column.boxes.length) return;
    column.boxes[boxIndex] = color;
  }

  clearColumn(columnIndex: number): void {
    const column = this.boxColumns[columnIndex];
    if (!column) return;
    column.boxes = [];
  }

  cycleBoxColor(columnIndex: number, boxIndex: number): void {
    const column = this.boxColumns[columnIndex];
    if (!column || !column.boxes[boxIndex]) return;
    const currentIndex = COLOR_IDS.indexOf(column.boxes[boxIndex]);
    column.boxes[boxIndex] = COLOR_IDS[(currentIndex + 1) % COLOR_IDS.length] as ColorId;
  }

  syncBoxColumnsToBlocks(): void {
    this.boxColumns = this._deriveBoxColumns(this.blocks);
  }

  getValidationStatus(): EditorValidationStatus {
    const blockColors = new Map<ColorId, number>();
    this.blocks.forEach((block) => {
      blockColors.set(block.color, (blockColors.get(block.color) ?? 0) + 1);
    });

    const boxColors = new Map<ColorId, number>();
    this.boxColumns.forEach((column) => {
      column.boxes.forEach((color) => {
        boxColors.set(color, (boxColors.get(color) ?? 0) + 1);
      });
    });

    const totalMarbles = this.blocks.length * 9;
    const totalBoxCapacity = this.boxColumns.reduce((sum, column) => sum + column.boxes.length, 0) * 3;
    const colorMismatch: EditorValidationMismatch[] = [];
    const allColors = new Set<ColorId>([...blockColors.keys(), ...boxColors.keys()]);

    allColors.forEach((color) => {
      const marbles = (blockColors.get(color) ?? 0) * 9;
      const slots = (boxColors.get(color) ?? 0) * 3;
      if (marbles !== slots) colorMismatch.push({ color, marbles, slots });
    });

    const totalsMatch = totalMarbles === totalBoxCapacity;
    const isValid = this.blocks.length > 0 && totalsMatch && colorMismatch.length === 0;
    const summary = isValid
      ? `${totalMarbles}/${totalBoxCapacity} valid`
      : this._validationProblemSummary(totalMarbles, totalBoxCapacity, colorMismatch);

    return { totalMarbles, totalBoxCapacity, totalsMatch, colorMismatch, isValid, summary };
  }

  getAgentBrief(): string {
    const validation = this.getValidationStatus();
    const colorCounts = (COLOR_IDS as ColorId[])
      .map((color) => `${color}:${this.blocks.filter((block) => block.color === color).length}`)
      .filter((entry) => !entry.endsWith(':0'))
      .join(', ') || 'none';
    const hiddenCount = this.blocks.filter((block) => block.is_hidden).length;
    const layeredCells = new Set(
      this.blocks.map((block) => `${block.col}:${block.row}`),
    ).size;
    const maxStack = Math.max(
      0,
      ...Array.from(new Set(this.blocks.map((block) => `${block.col}:${block.row}`))).map((key) => (
        this.blocks.filter((block) => `${block.col}:${block.row}` === key).length
      )),
    );
    const columns = this.boxColumns
      .map((column) => `col${column.col}[top->bottom:${column.boxes.join(',') || 'empty'}]`)
      .join('; ');

    const wallSummary = this.walls.length === 0
      ? 'Walls: none.'
      : `Walls (${this.walls.length}): ${this.walls.map((wall) => `${wall.col},${wall.row}`).join(' ')}.`;

    return [
      `Board ${this.gridCols}x${this.gridRows}, ${this.blocks.length} blocks across ${layeredCells} occupied cells.`,
      `Block colors: ${colorCounts}. Hidden blocks: ${hiddenCount}. Max stack height: ${maxStack}.`,
      wallSummary,
      `Box columns: ${columns}.`,
      `Conveyor speed: ${this.conveyorSpeed}. Gravity flip: ${this.gravityFlipEnabled ? 'on' : 'off'}. Magnet count: ${this.magnetCount}.`,
      `Validation: ${validation.summary}.`,
    ].join(' ');
  }

  exportJSON(): string {
    return JSON.stringify(this.toLevelData(), null, 2);
  }

  toLevelData(): LevelData {
    const sortedBlocks = [...this.blocks].sort(
      (a, b) => a.row - b.row || a.col - b.col || a.z - b.z || a.id.localeCompare(b.id),
    );
    return {
      level_id: 99,
      name: 'Custom Level',
      difficulty: 0,
      board_size: { cols: this.gridCols, rows: this.gridRows },
      blocks: sortedBlocks,
      walls: this.walls.map((wall) => ({ col: wall.col, row: wall.row })),
      box_columns: this.boxColumns.map((column) => ({ col: column.col, boxes: [...column.boxes] })),
      editor_metadata: {
        schema_version: 1,
        design_summary: this.getAgentBrief(),
        validation_summary: this.getValidationStatus().summary,
      },
      conveyor_speed: this.conveyorSpeed,
      gravity_flip_enabled: this.gravityFlipEnabled,
      magnet_count: this.magnetCount,
    };
  }

  importJSON(jsonStr: string | LevelData): void {
    const data = typeof jsonStr === 'string' ? (JSON.parse(jsonStr) as LevelData) : jsonStr;
    if (!data || typeof data !== 'object') throw new Error('Invalid JSON object.');
    if (!data.board_size) throw new Error('Missing board_size.');
    if (!Array.isArray(data.blocks)) throw new Error('Missing blocks array.');

    this.gridCols = data.board_size.cols || 5;
    this.gridRows = data.board_size.rows || 5;
    this.blocks = data.blocks.map((block, index) => ({
      id: block.id || `b_import_${index}`,
      col: Number(block.col),
      row: Number(block.row),
      z: Number(block.z || 0),
      color: block.color,
      is_hidden: Boolean(block.is_hidden),
      starts_concealed: Boolean(block.starts_concealed),
      ...(block.revealed_by ? { revealed_by: block.revealed_by } : {}),
    }));
    this.walls = Array.isArray(data.walls)
      ? data.walls.map((wall) => ({ col: Number(wall.col), row: Number(wall.row) }))
      : [];
    this.boxColumns = Array.isArray(data.box_columns)
      ? data.box_columns.map((column) => ({ col: column.col, boxes: [...column.boxes] }))
      : this._deriveBoxColumns(this.blocks);
    this.conveyorSpeed = data.conveyor_speed || 0.18;
    this.gravityFlipEnabled = Boolean(data.gravity_flip_enabled);
    this.magnetCount = data.magnet_count || 0;
    this.activeColumn = 0;
  }

  clear(): void {
    this.blocks = [];
    this.walls = [];
    this.trays = [];
    this.boxColumns = this._emptyBoxColumns();
  }

  private _emptyBoxColumns(): BoxColumn[] {
    return [0, 1, 2, 3].map((col) => ({ col, boxes: [] }));
  }

  private _deriveBoxColumns(blocks: readonly BlockRecord[]): BoxColumn[] {
    const columns = this._emptyBoxColumns();
    let columnIndex = 0;
    (COLOR_IDS as ColorId[]).forEach((color) => {
      const blockCount = blocks.filter((block) => block.color === color).length;
      for (let i = 0; i < blockCount * 3; i += 1) {
        columns[columnIndex % columns.length]!.boxes.push(color);
        columnIndex += 1;
      }
    });
    return columns;
  }

  private _validationProblemSummary(
    totalMarbles: number,
    totalBoxCapacity: number,
    colorMismatch: readonly EditorValidationMismatch[],
  ): string {
    if (totalMarbles !== totalBoxCapacity) return `${totalMarbles}/${totalBoxCapacity} mismatch`;
    const firstMismatch = colorMismatch[0];
    if (firstMismatch) return `${firstMismatch.color}: ${firstMismatch.marbles}M vs ${firstMismatch.slots}S`;
    if (this.blocks.length === 0) return 'empty level';
    return 'invalid';
  }
}
