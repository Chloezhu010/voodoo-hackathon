import { CONFIG, UI } from '../config/constants.js';

import { attachHitZone } from './hitZones.js';

interface TextOptions {
  fontSize?: string;
  color?: string;
  align?: string;
  wordWrap?: Phaser.Types.GameObjects.Text.TextWordWrap;
  originX?: number;
  originY?: number;
  stroke?: string;
  strokeThickness?: number;
  shadowX?: number;
  shadowY?: number;
  shadowColor?: string;
  shadowBlur?: number;
  depth?: number;
}

interface PanelOptions {
  shadowOffset?: number;
  shadowColor?: number;
  shadowAlpha?: number;
  fill?: number;
  alpha?: number;
  highlight?: number;
  highlightAlpha?: number;
  strokeWidth?: number;
  stroke?: number;
  strokeAlpha?: number;
}

interface ButtonOptions {
  radius?: number;
  fill?: number;
  dark?: number;
  textColor?: string;
  highlight?: number;
  highlightAlpha?: number;
  strokeWidth?: number;
  stroke?: number;
  strokeAlpha?: number;
  fontSize?: string;
  textStroke?: string;
  textStrokeThickness?: number;
  depth?: number;
}

interface HudPillOptions {
  fill?: number;
  dark?: number;
  fontSize?: string;
  depth?: number;
}

export interface LabelContainer extends Phaser.GameObjects.Container {
  labelText: Phaser.GameObjects.Text;
}

export function colorToCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

export function drawSkyBackground(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  scene.cameras.main.setBackgroundColor(colorToCss(UI.BACKGROUND));
  const g = scene.add.graphics();
  g.setDepth(-100);
  g.fillStyle(UI.BACKGROUND, 1);
  g.fillRect(0, 0, CONFIG.GAME_WIDTH, CONFIG.GAME_HEIGHT);
  return g;
}

export function addOutlinedText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  content: string,
  options: TextOptions = {},
): Phaser.GameObjects.Text {
  const style: Phaser.Types.GameObjects.Text.TextStyle = {
    fontSize: options.fontSize ?? '34px',
    color: options.color ?? UI.TEXT,
    fontStyle: 'bold',
    align: options.align ?? 'center',
  };
  if (options.wordWrap) style.wordWrap = options.wordWrap;

  const text = scene.add.text(x, y, content, {
    ...style,
  }).setOrigin(options.originX ?? 0.5, options.originY ?? 0.5);

  text.setStroke(options.stroke ?? colorToCss(UI.BLUE_STROKE), options.strokeThickness ?? 6);
  text.setShadow(
    options.shadowX ?? 0,
    options.shadowY ?? 4,
    options.shadowColor ?? '#2f4c82',
    options.shadowBlur ?? 0,
    true,
    true,
  );
  if (Number.isFinite(options.depth)) text.setDepth(options.depth!);
  return text;
}

export function drawBubblePanel(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  radius = 28,
  options: PanelOptions = {},
): void {
  const shadowOffset = options.shadowOffset ?? 8;
  graphics.fillStyle(options.shadowColor ?? UI.SOFT_SHADOW, options.shadowAlpha ?? 0.28);
  graphics.fillRoundedRect(x, y + shadowOffset, width, height, radius);

  graphics.fillStyle(options.fill ?? UI.PANEL, options.alpha ?? 1);
  graphics.fillRoundedRect(x, y, width, height, radius);

  graphics.fillStyle(options.highlight ?? 0xffffff, options.highlightAlpha ?? 0.22);
  graphics.fillRoundedRect(x + 14, y + 12, width - 28, Math.min(44, height * 0.28), Math.max(12, radius - 8));

  graphics.lineStyle(options.strokeWidth ?? 6, options.stroke ?? UI.BLUE_STROKE, options.strokeAlpha ?? 0.9);
  graphics.strokeRoundedRect(x, y, width, height, radius);
}

export function addBubbleButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  options: ButtonOptions = {},
): LabelContainer {
  const container = scene.add.container(x, y) as LabelContainer;
  const radius = options.radius ?? Math.round(height * 0.32);
  const base = options.fill ?? UI.PRIMARY;
  const dark = options.dark ?? UI.PRIMARY_DARK;
  const textColor = options.textColor ?? UI.TEXT;
  const g = scene.add.graphics();

  g.fillStyle(dark, 1);
  g.fillRoundedRect(-width / 2, -height / 2 + 8, width, height, radius);
  g.fillStyle(base, 1);
  g.fillRoundedRect(-width / 2, -height / 2, width, height, radius);
  g.fillStyle(options.highlight ?? 0xffffff, options.highlightAlpha ?? 0.26);
  g.fillRoundedRect(-width / 2 + 12, -height / 2 + 8, width - 24, Math.max(12, height * 0.28), radius * 0.65);
  g.lineStyle(options.strokeWidth ?? 4, options.stroke ?? 0xffffff, options.strokeAlpha ?? 0.52);
  g.strokeRoundedRect(-width / 2, -height / 2, width, height, radius);

  const text = addOutlinedText(scene, 0, -1, label, {
    fontSize: options.fontSize ?? (height >= 90 ? '38px' : '28px'),
    color: textColor,
    stroke: options.textStroke ?? colorToCss(dark),
    strokeThickness: options.textStrokeThickness ?? 5,
    shadowY: 2,
    shadowColor: colorToCss(dark),
  });
  container.add([g, text]);
  container.labelText = text;
  container.setSize(width, height);
  if (Number.isFinite(options.depth)) container.setDepth(options.depth!);
  const hitZoneOptions = Number.isFinite(options.depth) ? { depth: options.depth! + 1 } : {};
  attachHitZone(scene, container, width, height, hitZoneOptions);

  container.on('pointerover', () => {
    scene.tweens.add({ targets: container, scale: 1.045, duration: 110, ease: 'Back.easeOut' });
  });
  container.on('pointerout', () => {
    scene.tweens.add({ targets: container, scale: 1, duration: 110, ease: 'Back.easeOut' });
  });
  container.on('pointerdown', () => {
    scene.tweens.add({ targets: container, scaleX: 0.96, scaleY: 0.92, duration: 70, ease: 'Quad.easeOut' });
  });
  container.on('pointerup', () => {
    scene.tweens.add({ targets: container, scale: 1.045, duration: 90, ease: 'Back.easeOut' });
  });

  return container;
}

export function addHudPill(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  options: HudPillOptions = {},
): LabelContainer {
  const container = scene.add.container(x, y) as LabelContainer;
  const g = scene.add.graphics();
  const radius = height / 2;
  const fill = options.fill ?? UI.PRIMARY;
  const dark = options.dark ?? UI.PRIMARY_DARK;

  g.fillStyle(dark, 1);
  g.fillRoundedRect(-width / 2, -height / 2 + 5, width, height, radius);
  g.fillStyle(fill, 1);
  g.fillRoundedRect(-width / 2, -height / 2, width, height, radius);
  g.fillStyle(0xffffff, 0.22);
  g.fillRoundedRect(-width / 2 + 10, -height / 2 + 7, width - 20, height * 0.3, radius * 0.5);
  g.lineStyle(3, 0xffffff, 0.5);
  g.strokeRoundedRect(-width / 2, -height / 2, width, height, radius);

  const text = addOutlinedText(scene, 0, -1, label, {
    fontSize: options.fontSize ?? '24px',
    stroke: colorToCss(dark),
    strokeThickness: 4,
    shadowY: 2,
    shadowColor: colorToCss(dark),
  });
  container.add([g, text]);
  container.labelText = text;
  if (Number.isFinite(options.depth)) container.setDepth(options.depth!);
  return container;
}
