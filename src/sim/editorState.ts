import { COLOR_IDS } from '../config/colors.js';

import type { BlockRecord, BoxColumn, ColorId, IdGen, LevelData, TrayConfig, WallCell } from './types.js';

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
  queueCapacity = 12;
  gravityFlipEnabled = false;
  magnetCount = 0;

  activeColor: ColorId = 'pink';
  activeZ = 0;
  activeIsHidden = false;
  eraseMode = false;

  constructor({ idGen = defaultIdGen }: EditorStateOptions = {}) {
    this._idGen = idGen;
    this.boxColumns = this._emptyBoxColumns();
  }

  placeBlock(col: number, row: number): void {
    if (this.eraseMode) {
      this.removeBlock(col, row);
      return;
    }

    const existing = this.blocks.find(
      (block) => block.col === col && block.row === row && block.z === this.activeZ,
    );

    if (existing) {
      existing.color = this.activeColor;
      existing.is_hidden = this.activeIsHidden;
      return;
    }

    this.blocks.push({
      id: this._idGen(),
      col,
      row,
      z: this.activeZ,
      color: this.activeColor,
      is_hidden: this.activeIsHidden,
    });
  }

  removeBlock(col: number, row: number): void {
    const stack = this.blocks
      .filter((block) => block.col === col && block.row === row)
      .sort((a, b) => b.z - a.z);
    if (stack.length === 0) return;
    const top = stack[0]!;
    this.blocks = this.blocks.filter((block) => block.id !== top.id);
  }

  toggleTray(color: ColorId): void {
    const index = this.trays.findIndex((tray) => tray.color === color);
    if (index >= 0) {
      this.trays.splice(index, 1);
      return;
    }
    this.trays.push({ color, capacity: 6 });
    this.trays.sort((a, b) => COLOR_IDS.indexOf(a.color) - COLOR_IDS.indexOf(b.color));
  }

  setQueueCapacity(value: number): void {
    this.queueCapacity = value;
  }

  setActiveZ(value: number): void {
    this.activeZ = Math.max(0, Math.min(2, value));
  }

  setMagnetCount(value: number): void {
    this.magnetCount = Math.max(0, Math.min(3, value));
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
      box_columns: this._deriveBoxColumns(sortedBlocks),
      conveyor_speed: 0.18,
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
    }));
    this.walls = Array.isArray(data.walls)
      ? data.walls.map((wall) => ({ col: Number(wall.col), row: Number(wall.row) }))
      : [];
    this.boxColumns = Array.isArray(data.box_columns)
      ? data.box_columns.map((column) => ({ col: column.col, boxes: [...column.boxes] }))
      : this._deriveBoxColumns(this.blocks);
    this.trays = Array.isArray(data.trays)
      ? data.trays.map((tray) => ({ color: tray.color, capacity: tray.capacity || 6 }))
      : this._legacyTraysFromBoxColumns();
    this.queueCapacity = data.queue_capacity || 12;
    this.gravityFlipEnabled = Boolean(data.gravity_flip_enabled);
    this.magnetCount = data.magnet_count || 0;
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

  private _legacyTraysFromBoxColumns(): TrayConfig[] {
    const seen = new Set<ColorId>(this.boxColumns.flatMap((column) => column.boxes));
    return [...seen].map((color) => ({ color, capacity: 6 }));
  }
}
