import { COLOR_IDS } from '../config/colors.js';

export default class EditorState {
  constructor() {
    this.gridCols = 5;
    this.gridRows = 5;
    this.blocks = [];
    this.trays = [];
    this.boxColumns = this._emptyBoxColumns();
    this.queueCapacity = 12;
    this.gravityFlipEnabled = false;
    this.magnetCount = 0;

    this.activeColor = 'pink';
    this.activeZ = 0;
    this.activeIsHidden = false;
    this.eraseMode = false;
  }

  placeBlock(col, row) {
    if (this.eraseMode) {
      this.removeBlock(col, row);
      return;
    }

    const existing = this.blocks.find((block) => (
      block.col === col && block.row === row && block.z === this.activeZ
    ));

    if (existing) {
      existing.color = this.activeColor;
      existing.is_hidden = this.activeIsHidden;
      return;
    }

    this.blocks.push({
      id: `b${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      col,
      row,
      z: this.activeZ,
      color: this.activeColor,
      is_hidden: this.activeIsHidden
    });
  }

  removeBlock(col, row) {
    const stack = this.blocks
      .filter((block) => block.col === col && block.row === row)
      .sort((a, b) => b.z - a.z);

    if (stack.length === 0) return;
    const top = stack[0];
    this.blocks = this.blocks.filter((block) => block.id !== top.id);
  }

  toggleTray(color) {
    const index = this.trays.findIndex((tray) => tray.color === color);
    if (index >= 0) {
      this.trays.splice(index, 1);
    } else {
      this.trays.push({ color, capacity: 6 });
      this.trays.sort((a, b) => COLOR_IDS.indexOf(a.color) - COLOR_IDS.indexOf(b.color));
    }
  }

  setQueueCapacity(value) {
    this.queueCapacity = value;
  }

  setActiveZ(value) {
    this.activeZ = Math.max(0, Math.min(2, value));
  }

  setMagnetCount(value) {
    this.magnetCount = Math.max(0, Math.min(3, value));
  }

  exportJSON() {
    return JSON.stringify(this.toLevelData(), null, 2);
  }

  toLevelData() {
    const sortedBlocks = [...this.blocks].sort((a, b) => (
      a.row - b.row || a.col - b.col || a.z - b.z || a.id.localeCompare(b.id)
    ));
    return {
      level_id: 99,
      name: 'Custom Level',
      difficulty: 0,
      board_size: { cols: this.gridCols, rows: this.gridRows },
      blocks: sortedBlocks,
      box_columns: this._deriveBoxColumns(sortedBlocks),
      conveyor_speed: 0.18,
      gravity_flip_enabled: this.gravityFlipEnabled,
      magnet_count: this.magnetCount
    };
  }

  importJSON(jsonStr) {
    const data = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
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
      is_hidden: Boolean(block.is_hidden)
    }));
    this.boxColumns = Array.isArray(data.box_columns)
      ? data.box_columns.map((column) => ({
        col: column.col,
        boxes: [...column.boxes]
      }))
      : this._deriveBoxColumns(this.blocks);
    this.trays = Array.isArray(data.trays)
      ? data.trays.map((tray) => ({ color: tray.color, capacity: tray.capacity || 6 }))
      : this._legacyTraysFromBoxColumns();
    this.queueCapacity = data.queue_capacity || 12;
    this.gravityFlipEnabled = Boolean(data.gravity_flip_enabled);
    this.magnetCount = data.magnet_count || 0;
  }

  clear() {
    this.blocks = [];
    this.trays = [];
    this.boxColumns = this._emptyBoxColumns();
  }

  _emptyBoxColumns() {
    return [0, 1, 2, 3].map((col) => ({ col, boxes: [] }));
  }

  _deriveBoxColumns(blocks) {
    const columns = this._emptyBoxColumns();
    let columnIndex = 0;
    COLOR_IDS.forEach((color) => {
      const blockCount = blocks.filter((block) => block.color === color).length;
      for (let i = 0; i < blockCount * 3; i += 1) {
        columns[columnIndex % columns.length].boxes.push(color);
        columnIndex += 1;
      }
    });
    return columns;
  }

  _legacyTraysFromBoxColumns() {
    const seen = new Set(this.boxColumns.flatMap((column) => column.boxes));
    return [...seen].map((color) => ({ color, capacity: 6 }));
  }
}
