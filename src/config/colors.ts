import type { ColorId } from '../sim/types.js';

export interface ColorDefinition {
  readonly id: ColorId;
  readonly hex: number;
  readonly label: string;
}

export const COLORS = {
  PINK: { id: 'pink', hex: 0xff5aa7, label: 'P' },
  BLUE: { id: 'blue', hex: 0x315cf6, label: 'B' },
  GREEN: { id: 'green', hex: 0x18d84f, label: 'G' },
  YELLOW: { id: 'yellow', hex: 0xfff300, label: 'Y' },
  PURPLE: { id: 'purple', hex: 0xb66bf2, label: 'U' },
  ORANGE: { id: 'orange', hex: 0xffa407, label: 'O' },
} as const satisfies Record<string, ColorDefinition>;

export const COLOR_IDS: readonly ColorId[] = Object.values(COLORS).map((color) => color.id);

export function getColorDefinition(colorId: ColorId): ColorDefinition {
  return Object.values(COLORS).find((color) => color.id === colorId) ?? COLORS.PINK;
}
