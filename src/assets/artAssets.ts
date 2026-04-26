import { COLOR_IDS } from '../config/colors.js';
import type { ColorId } from '../sim/types.js';

export const ART_KEYS = {
  sky: 'art:background/sky',
  playfieldShell: 'art:board/playfield-shell',
  conveyorDock: 'art:board/conveyor-dock',
  boxColumnDock: 'art:board/box-column-dock',
  blockHidden: 'art:blocks/block-hidden',
  conveyorTrack: 'art:conveyor/conveyor-track',
  slotEmpty: 'art:conveyor/slot-empty',
  slotOccupied: 'art:conveyor/slot-occupied',
  buttonPrimary: 'art:ui/button-primary',
  buttonAccent: 'art:ui/button-accent',
  backButton: 'art:ui/back-button',
  hudPill: 'art:ui/hud-pill',
  panel: 'art:ui/panel',
  levelCard: 'art:ui/level-card',
  levelBadge: 'art:ui/level-badge',
  lockedLevelCard: 'art:ui/locked-level-card',
  arrowButton: 'art:ui/arrow-button',
  coin: 'art:ui/coin',
  settingsButton: 'art:ui/settings-button',
  plusButton: 'art:ui/plus-button',
} as const;

const STATIC_ART_PATHS = [
  'background/sky.svg',
  'board/playfield-shell.svg',
  'board/wall-region-sample.svg',
  'board/funnel-mouth.svg',
  'board/conveyor-dock.svg',
  'board/box-column-dock.svg',
  'conveyor/conveyor-track.svg',
  'conveyor/slot-empty.svg',
  'conveyor/slot-occupied.svg',
  'conveyor/output-port-empty.svg',
  'blocks/block-hidden.svg',
  'ui/button-primary.svg',
  'ui/button-accent.svg',
  'ui/back-button.svg',
  'ui/hud-pill.svg',
  'ui/panel.svg',
  'ui/level-card.svg',
  'ui/level-badge.svg',
  'ui/locked-level-card.svg',
  'ui/arrow-button.svg',
  'ui/toast-panel.svg',
  'ui/game-over-panel.svg',
  'ui/result-badge-win.svg',
  'ui/result-badge-lose.svg',
  'ui/editor-grid-panel.svg',
  'ui/icon-gear.svg',
  'ui/icon-plus.svg',
  'ui/icon-lock.svg',
  'ui/coin.svg',
  'ui/settings-button.svg',
  'ui/plus-button.svg',
] as const;

function textureKey(path: string): string {
  return `art:${path.replace(/\.svg$/, '')}`;
}

function assetUrl(path: string): string {
  return `/art/${path}`;
}

export function blockArtKey(color: ColorId, variant: 'open' | 'covered'): string {
  return `art:blocks/block-${color}-${variant}`;
}

export function boxArtKey(color: ColorId, variant: 'empty' | 'full' = 'empty'): string {
  return `art:boxes/box-${color}-${variant}`;
}

export function marbleArtKey(color: ColorId): string {
  return `art:marbles/marble-${color}`;
}

export function outputPortArtKey(color: ColorId | null): string {
  return color ? `art:conveyor/output-port-${color}` : 'art:conveyor/output-port-empty';
}

export function hasArtTexture(scene: Phaser.Scene, key: string): boolean {
  return scene.textures.exists(key);
}

export function preloadArtAssets(scene: Phaser.Scene): void {
  const paths = [
    ...STATIC_ART_PATHS,
    ...COLOR_IDS.flatMap((color) => [
      `marbles/marble-${color}.svg`,
      `blocks/block-${color}-open.svg`,
      `blocks/block-${color}-covered.svg`,
      `boxes/box-${color}-empty.svg`,
      `boxes/box-${color}-full.svg`,
      `conveyor/output-port-${color}.svg`,
      `ui/swatch-${color}.svg`,
    ]),
  ];

  paths.forEach((path) => {
    const key = textureKey(path);
    if (!scene.textures.exists(key)) scene.load.svg(key, assetUrl(path));
  });
}
