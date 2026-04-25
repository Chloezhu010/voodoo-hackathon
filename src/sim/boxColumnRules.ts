import { CONFIG } from '../config/constants.js';

import type { ColorId } from './types.js';

export interface BoxSlotState {
  color: ColorId;
  reservedCount: number;
  capacity?: number;
}

export interface BoxColumnState {
  boxes: BoxSlotState[];
}

export interface ReservedTopBoxSlot {
  slotIndex: number;
  nextColumn: BoxColumnState;
  advanced: boolean;
}

export function boxCapacity(box: Pick<BoxSlotState, 'capacity'>): number {
  return box.capacity ?? Number(CONFIG.BOX_COLUMNS.BOX_CAPACITY);
}

export function canAcceptBoxSlot(box: BoxSlotState, color: ColorId): boolean {
  return box.color === color && box.reservedCount < boxCapacity(box);
}

export function reserveBoxSlotIndex(
  reservedCount: number,
  capacity: number = CONFIG.BOX_COLUMNS.BOX_CAPACITY,
): number | null {
  if (reservedCount < 0 || reservedCount >= capacity) return null;
  return reservedCount;
}

export function canAcceptTopBoxColor(column: BoxColumnState, color: ColorId): boolean {
  const topBox = column.boxes[0];
  return Boolean(topBox && canAcceptBoxSlot(topBox, color));
}

export function reserveTopBoxSlot(column: BoxColumnState, color: ColorId): ReservedTopBoxSlot | null {
  const topBox = column.boxes[0];
  if (!topBox || !canAcceptBoxSlot(topBox, color)) return null;

  const slotIndex = topBox.reservedCount;
  const reservedCount = topBox.reservedCount + 1;
  const advanced = reservedCount >= boxCapacity(topBox);
  const updatedTop = { ...topBox, reservedCount };
  return {
    slotIndex,
    advanced,
    nextColumn: {
      boxes: advanced ? column.boxes.slice(1) : [updatedTop, ...column.boxes.slice(1)],
    },
  };
}
