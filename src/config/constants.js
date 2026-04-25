export const CONFIG = {
  GAME_WIDTH: 720,
  GAME_HEIGHT: 1280,
  BLOCK_SIZE: 96,
  MARBLES_PER_BLOCK: 6,
  MARBLE_RADIUS: 14,
  QUEUE_CAPACITY_DEFAULT: 12,
  TRAY_CAPACITY: 6,

  HEADER_HEIGHT: 80,
  BOARD_AREA: { x: 60, y: 120, width: 600, height: 600 },
  FUNNEL_AREA: { x: 200, y: 740, width: 320, height: 100 },
  QUEUE_AREA: { x: 80, y: 860, width: 560, height: 80 },
  TRAY_AREA: { x: 80, y: 980, width: 560, height: 200 },

  MARBLE_FALL_DURATION: 600,
  MARBLE_TO_TRAY_DURATION: 400
};

export const UI = {
  BACKGROUND: 0x1a1a2e,
  PANEL: 0x2d2d44,
  PANEL_DARK: 0x222238,
  PANEL_LIGHT: 0x3a3a55,
  PRIMARY: 0xff6b9d,
  TEXT: '#ffffff',
  MUTED_TEXT: '#a0a0b8',
  GOLD: 0xffd86b
};
