export const COLORS = {
  PINK: { id: 'pink', hex: 0xff6b9d, label: 'P' },
  BLUE: { id: 'blue', hex: 0x4ec5f1, label: 'B' },
  GREEN: { id: 'green', hex: 0x7ed957, label: 'G' },
  YELLOW: { id: 'yellow', hex: 0xffd93d, label: 'Y' },
  PURPLE: { id: 'purple', hex: 0xa56ef0, label: 'U' },
  ORANGE: { id: 'orange', hex: 0xff9a3c, label: 'O' }
};

export const COLOR_IDS = Object.values(COLORS).map((color) => color.id);

export function getColorDefinition(colorId) {
  return Object.values(COLORS).find((color) => color.id === colorId) || COLORS.PINK;
}
