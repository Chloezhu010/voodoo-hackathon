import { CONFIG } from '../config/constants.js';

import type { GeminiBriefReport } from '../services/geminiBrief.js';
import type { ColorId } from '../sim/types.js';

export const EDITOR_CELL_SIZE = 88;
export const EDITOR_CANVAS_WIDTH = 1540;
export const EDITOR_GAME_X = (EDITOR_CANVAS_WIDTH - CONFIG.GAME_WIDTH) / 2;
export const GRID_START = {
  x: (CONFIG.GAME_WIDTH - EDITOR_CELL_SIZE * 5) / 2,
  y: 136,
} as const;
export const EDITOR_BLOCK_SIZE = 66;
export const CONVEYOR_SPEED_OPTIONS = [0.12, 0.16, 0.18, 0.22, 0.26] as const;
export const BOX_COLUMN_MAX_BOXES = 6;
export const AI_REVIEW_MODAL = {
  width: 900,
  height: 1010,
  actionY: 452,
  contentWidth: 800,
} as const;
export const EDITOR_LAYOUT = {
  briefLeft: { x: -398, y: 122, width: 176, height: 536 },
  palette: { x: -204, y: 122, width: 176, height: 536 },
  tools: { x: 748, y: 122, width: 176, height: 536 },
  briefRight: { x: 942, y: 122, width: 176, height: 536 },
  boxes: { x: 64, y: 704, width: 592, height: 390 },
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

export interface AgentBriefView {
  body: Phaser.GameObjects.Container;
  copyState: { text: string };
  localBrief: string;
  status: Phaser.GameObjects.Text;
}

export interface BriefCard {
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  body: string;
  color: number;
  delay?: number;
  maxLines?: number;
}

export interface BriefPill {
  x: number;
  y: number;
  width: number;
  label: string;
  value: string;
  color: number;
}

export interface SidebarCard {
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  body: string;
  color: number;
  maxLines: number;
  inverted?: boolean;
}

declare global {
  interface Window {
    _editorStateSnapshot?: string;
    _editorAgentBriefReport?: GeminiBriefReport;
  }
}
