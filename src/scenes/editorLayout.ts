import { CONFIG } from '../config/constants.js';
import type { GeminiBriefReport } from '../services/geminiBrief.js';
import type { ColorId } from '../sim/types.js';

export const EDITOR_CELL_SIZE = 88;
export const EDITOR_CANVAS_WIDTH = 2048;
export const EDITOR_GAME_X = (EDITOR_CANVAS_WIDTH - CONFIG.GAME_WIDTH) / 2;
export const GRID_START = {
  x: (CONFIG.GAME_WIDTH - EDITOR_CELL_SIZE * 5) / 2,
  y: 136,
} as const;
export const EDITOR_BLOCK_SIZE = 66;
export const CONVEYOR_SPEED_OPTIONS = [0.12, 0.16, 0.18, 0.22, 0.26] as const;
export const BOX_COLUMN_MAX_BOXES = 6;
export const EDITOR_LAYOUT = {
  palette: { x: -220, y: 122, width: 196, height: 536 },
  tools: { x: 744, y: 122, width: 196, height: 536 },
  boxes: { x: 44, y: 704, width: 632, height: 390 },
  ioY: 1180,
} as const;

export interface HoverCell {
  col: number;
  row: number;
}

export interface ActiveTextInput {
  value: string;
  text: Phaser.GameObjects.Text;
  errorText: Phaser.GameObjects.Text | null;
}

export interface DragState {
  color: ColorId;
  preview: Phaser.GameObjects.Container;
  startX: number;
  startY: number;
  hasMoved: boolean;
  targetCell: HoverCell | null;
}

declare global {
  interface Window {
    _editorStateSnapshot?: string;
    _editorAgentBriefReport?: GeminiBriefReport;
  }
}
