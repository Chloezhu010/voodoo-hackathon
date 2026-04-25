/* eslint-disable max-lines */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const OUT = join(ROOT, 'assets', 'art');

const colors = {
  pink: { hex: '#ff5aa7', dark: '#c63878', label: 'Pink' },
  blue: { hex: '#315df4', dark: '#1744c3', label: 'Blue' },
  green: { hex: '#18d757', dark: '#0aa13d', label: 'Green' },
  yellow: { hex: '#ffe424', dark: '#d3a500', label: 'Yellow' },
  purple: { hex: '#a66bf0', dark: '#7442ba', label: 'Purple' },
  orange: { hex: '#ff9f1a', dark: '#d56d11', label: 'Orange' },
};

const manifest = [];

function writeAsset(path, label, description, content, { register = true } = {}) {
  const filePath = join(OUT, path);
  mkdirSync(dirname(filePath), { recursive: true });
  const normalized = content
    .trim()
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n');
  writeFileSync(filePath, `${normalized}\n`);
  if (register) manifest.push({ path: `assets/art/${path}`, label, description });
}

function svg(width, height, body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none">
${body}
</svg>`;
}

function roundedButton({ width, height, fill, dark, stroke = '#ffffff', radius = 34 }) {
  return svg(width, height, `
  <rect x="0" y="8" width="${width}" height="${height - 8}" rx="${radius}" fill="${dark}"/>
  <rect x="0" y="0" width="${width}" height="${height - 8}" rx="${radius}" fill="${fill}"/>
  <rect x="13" y="9" width="${width - 26}" height="${Math.round(height * 0.26)}" rx="${Math.round(radius * 0.62)}" fill="#ffffff" opacity="0.26"/>
  <rect x="1.5" y="1.5" width="${width - 3}" height="${height - 11}" rx="${radius - 1.5}" stroke="${stroke}" stroke-width="3" opacity="0.54"/>
  `);
}

function panelSvg(width, height, radius = 34) {
  return svg(width, height, `
  <rect x="10" y="18" width="${width - 20}" height="${height - 26}" rx="${radius}" fill="#324b82" opacity="0.28"/>
  <rect x="4" y="4" width="${width - 8}" height="${height - 16}" rx="${radius}" fill="#e4f2f8"/>
  <rect x="20" y="18" width="${width - 40}" height="44" rx="${Math.max(12, radius - 8)}" fill="#ffffff" opacity="0.22"/>
  <rect x="7" y="7" width="${width - 14}" height="${height - 22}" rx="${radius - 2}" stroke="#4969a1" stroke-width="6" opacity="0.9"/>
  `);
}

function marbleSvg(color) {
  const c = colors[color];
  return svg(40, 40, `
  <circle cx="23" cy="24" r="16" fill="#263f73" opacity="0.22"/>
  <circle cx="20" cy="20" r="14" fill="${c.hex}"/>
  <circle cx="15" cy="15" r="5" fill="#ffffff" opacity="0.45"/>
  <circle cx="18" cy="18" r="8" fill="#ffffff" opacity="0.18"/>
  <circle cx="20" cy="20" r="14" stroke="#ffffff" stroke-width="2" opacity="0.35"/>
  `);
}

function blockSvg(color, variant) {
  const c = colors[color];
  const isCovered = variant === 'covered';
  const showMarbles = variant === 'open';
  const overlay = isCovered ? '<rect x="0" y="0" width="96" height="96" rx="16" fill="#2c4778" opacity="0.36"/>' : '';
  const marbles = showMarbles ? Array.from({ length: 9 }, (_, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const cx = 28 + col * 20;
    const cy = 30 + row * 20;
    return `
  <circle cx="${cx + 2}" cy="${cy + 3}" r="10" fill="#000000" opacity="0.12"/>
  <circle cx="${cx}" cy="${cy}" r="10" fill="${c.hex}"/>
  <circle cx="${cx - 3}" cy="${cy - 3}" r="3.4" fill="#ffffff" opacity="0.24"/>`;
  }).join('') : `
  <rect x="18" y="31" width="60" height="40" rx="10" fill="#1f355c" opacity="${isCovered ? 0.22 : 0.1}"/>
  <circle cx="40" cy="40" r="8" fill="#ffffff" opacity="${isCovered ? 0.08 : 0.16}"/>`;

  return svg(96, 96, `
  <rect x="7" y="11" width="88" height="88" rx="16" fill="#2d477a" opacity="0.22"/>
  <rect x="0" y="8" width="96" height="96" rx="16" fill="#000000" opacity="0.16"/>
  <rect x="0" y="0" width="96" height="96" rx="16" fill="${c.hex}"/>
  <rect x="10" y="8" width="76" height="21" rx="11" fill="#ffffff" opacity="0.32"/>
  <rect x="6" y="72" width="84" height="19" rx="9" fill="#000000" opacity="0.12"/>
  <rect x="14" y="24" width="68" height="58" rx="12" fill="#173968" opacity="${showMarbles ? 0.2 : 0}"/>
  ${marbles}
  <rect x="14" y="27" width="68" height="50" rx="12" stroke="#23385f" stroke-width="3" opacity="${showMarbles ? 0.2 : 0}"/>
  <rect x="2" y="2" width="92" height="92" rx="15" stroke="#ffffff" stroke-width="4" opacity="0.38"/>
  <rect x="0" y="0" width="96" height="96" rx="16" stroke="#29457a" stroke-width="4" opacity="0.34"/>
  ${overlay}
  `);
}

function hiddenBlockSvg() {
  return svg(96, 96, `
  <rect x="7" y="11" width="88" height="88" rx="16" fill="#2d477a" opacity="0.22"/>
  <rect x="0" y="8" width="96" height="96" rx="16" fill="#000000" opacity="0.16"/>
  <rect x="0" y="0" width="96" height="96" rx="16" fill="#aebbd0"/>
  <rect x="10" y="8" width="76" height="21" rx="11" fill="#ffffff" opacity="0.24"/>
  <circle cx="48" cy="48" r="24" fill="#ffffff" opacity="0.14"/>
  <text x="48" y="66" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="54" font-weight="700" fill="#ffffff" stroke="#63718a" stroke-width="5" paint-order="stroke">?</text>
  <rect x="2" y="2" width="92" height="92" rx="15" stroke="#ffffff" stroke-width="4" opacity="0.38"/>
  <rect x="0" y="0" width="96" height="96" rx="16" stroke="#29457a" stroke-width="4" opacity="0.34"/>
  `);
}

function boxSvg(color, filled = false) {
  const c = colors[color];
  const balls = [28, 50, 72].map((x) => {
    if (!filled) {
      return `
  <circle cx="${x}" cy="25" r="15" fill="#23385f" opacity="0.28"/>
  <circle cx="${x - 2}" cy="23" r="12" fill="#ffffff" opacity="0.16"/>
  <circle cx="${x}" cy="25" r="12" stroke="#ffffff" stroke-width="2" opacity="0.5"/>`;
    }
    return `
  <circle cx="${x + 2}" cy="28" r="13" fill="#23385f" opacity="0.2"/>
  <circle cx="${x}" cy="25" r="12" fill="${c.hex}"/>
  <circle cx="${x - 4}" cy="21" r="4" fill="#ffffff" opacity="0.42"/>
  <circle cx="${x}" cy="25" r="12" stroke="#ffffff" stroke-width="2" opacity="0.36"/>`;
  }).join('');

  return svg(100, 50, `
  <rect x="5" y="7" width="100" height="50" rx="10" fill="#2d477a" opacity="0.2"/>
  <rect x="0" y="8" width="100" height="42" rx="8" fill="#000000" opacity="0.14"/>
  <rect x="0" y="0" width="100" height="50" rx="8" fill="${c.hex}"/>
  <rect x="6" y="5" width="88" height="13" rx="7" fill="#ffffff" opacity="0.22"/>
  <rect x="4" y="37" width="92" height="9" rx="5" fill="#000000" opacity="0.12"/>
  ${balls}
  <rect x="1.5" y="1.5" width="97" height="47" rx="7" stroke="#29457a" stroke-width="3" opacity="0.4"/>
  `);
}

function outputPortSvg(color = null) {
  const fill = color ? colors[color].hex : '#d9e7f6';
  const stroke = color ? '#ffffff' : '#4969a1';
  return svg(90, 48, `
  <path d="M5 12H85L45 44Z" fill="#4969a1" opacity="0.26"/>
  <path d="M5 4H85L45 36Z" fill="${fill}" opacity="0.94" stroke="${stroke}" stroke-width="4" stroke-linejoin="round"/>
  `);
}

function playfieldSvg() {
  return svg(720, 840, `
  <path d="M92 126L626 130C654 132 674 148 674 168L686 632C686 656 670 676 646 684L468 720L426 760V832H294V760L252 720L76 684C52 676 34 656 34 632L48 166C49 144 66 126 92 126Z" fill="#314d83" opacity="0.26" transform="translate(0 14)"/>
  <path d="M92 126L626 130C654 132 674 148 674 168L686 632C686 656 670 676 646 684L468 720L426 760V832H294V760L252 720L76 684C52 676 34 656 34 632L48 166C49 144 66 126 92 126Z" fill="#a7c4d0"/>
  <path d="M92 166H620C634 166 644 176 644 190L656 612C656 628 640 642 612 646L450 676L406 722V782H314V722L270 676L108 646C82 642 66 628 66 616L74 190C74 176 82 166 92 166Z" fill="#c8dbe2" opacity="0.34"/>
  <path d="M92 126L626 130C654 132 674 148 674 168L686 632C686 656 670 676 646 684L468 720L426 760V832H294V760L252 720L76 684C52 676 34 656 34 632L48 166C49 144 66 126 92 126Z" stroke="#38598e" stroke-width="22" opacity="0.52" transform="translate(0 10)" stroke-linejoin="round"/>
  <path d="M92 126L626 130C654 132 674 148 674 168L686 632C686 656 670 676 646 684L468 720L426 760V832H294V760L252 720L76 684C52 676 34 656 34 632L48 166C49 144 66 126 92 126Z" stroke="#466aa0" stroke-width="14" stroke-linejoin="round"/>
  <path d="M92 126L626 130C654 132 674 148 674 168L686 632C686 656 670 676 646 684L468 720L426 760V832H294V760L252 720L76 684C52 676 34 656 34 632L48 166C49 144 66 126 92 126Z" stroke="#d7ecf4" stroke-width="4" opacity="0.26" transform="translate(0 -2)" stroke-linejoin="round"/>
  <path d="M266 694H454L410 762V838H310V762Z" fill="#38598e" opacity="0.18" transform="translate(0 8)"/>
  <path d="M266 694H454L410 762V838H310V762Z" fill="#f4f8ff" opacity="0.96"/>
  <path d="M266 694H454L410 762V838H310V762Z" stroke="#466aa0" stroke-width="7" opacity="0.52" stroke-linejoin="round"/>
  <path d="M286 708H434L398 762V812H322V762Z" stroke="#ffffff" stroke-width="3" opacity="0.28" stroke-linejoin="round"/>
  `);
}

function wallRegionSvg() {
  return svg(520, 360, `
  <path d="M104 24H416V120H360V216H464V312H256V216H208V312H56V120H104Z" fill="#3b5c77"/>
  <path d="M104 24H416V120H360V216H464V312H256V216H208V312H56V120H104Z" stroke="#243d5d" stroke-width="18" opacity="0.24" transform="translate(0 10)" stroke-linejoin="round"/>
  <path d="M104 24H416V120H360V216H464V312H256V216H208V312H56V120H104Z" stroke="#254661" stroke-width="8" stroke-linejoin="round"/>
  <path d="M104 24H416V120H360V216H464V312H256V216H208V312H56V120H104Z" stroke="#c7dbe5" stroke-width="3" opacity="0.22" transform="translate(0 -2)" stroke-linejoin="round"/>
  `);
}

function conveyorTrackSvg() {
  return svg(640, 320, `
  <path d="M50 85H590A75 75 0 0 1 590 235H50A75 75 0 0 1 50 85Z" stroke="#4969a1" stroke-width="52" stroke-linejoin="round"/>
  <path d="M50 85H590A75 75 0 0 1 590 235H50A75 75 0 0 1 50 85Z" stroke="#d9e7f6" stroke-width="42" stroke-linejoin="round"/>
  <path d="M50 85H590A75 75 0 0 1 590 235H50A75 75 0 0 1 50 85Z" stroke="#8b97ab" stroke-width="28" stroke-linejoin="round"/>
  <path d="M50 85H590A75 75 0 0 1 590 235H50A75 75 0 0 1 50 85Z" stroke="#5f687d" stroke-width="18" stroke-linejoin="round"/>
  <path d="M50 85H590A75 75 0 0 1 590 235H50A75 75 0 0 1 50 85Z" stroke="#ffffff" stroke-width="3" opacity="0.38" stroke-linejoin="round"/>
  `);
}

function slotSvg(occupied = false) {
  return svg(32, 32, `
  <circle cx="16" cy="16" r="12" fill="${occupied ? '#ffffff' : '#37445c'}" opacity="${occupied ? 0.18 : 0.7}"/>
  <circle cx="13" cy="13" r="8" fill="#ffffff" opacity="${occupied ? 0.22 : 0.16}"/>
  <circle cx="16" cy="16" r="12" stroke="#ffffff" stroke-width="2" opacity="${occupied ? 0.42 : 0.2}"/>
  `);
}

function swatchSvg(color) {
  const c = colors[color];
  return svg(64, 64, `
  <rect x="2" y="2" width="60" height="60" rx="12" fill="${c.hex}"/>
  <rect x="8" y="8" width="48" height="16" rx="8" fill="#ffffff" opacity="0.24"/>
  <rect x="2" y="2" width="60" height="60" rx="12" stroke="#ffffff" stroke-width="4" opacity="0.55"/>
  `);
}

function conveyorDockSvg() {
  return svg(720, 420, `
  <path d="M96 46H292V0L322 -32H398L428 0V46H624L666 80L682 130V328L640 368H80L38 328V130L54 80Z" fill="#324b82" opacity="0.24" transform="translate(0 14)"/>
  <path d="M96 46H292V0L322 -32H398L428 0V46H624L666 80L682 130V328L640 368H80L38 328V130L54 80Z" fill="#f4f8ff" transform="translate(0 32)"/>
  <path d="M118 66H602L632 94L642 130H78L88 94Z" fill="#ffffff" opacity="0.2" transform="translate(0 32)"/>
  <path d="M96 46H292V0L322 -32H398L428 0V46H624L666 80L682 130V328L640 368H80L38 328V130L54 80Z" stroke="#38598e" stroke-width="18" opacity="0.44" transform="translate(0 42)" stroke-linejoin="round"/>
  <path d="M96 46H292V0L322 -32H398L428 0V46H624L666 80L682 130V328L640 368H80L38 328V130L54 80Z" stroke="#4969a1" stroke-width="10" opacity="0.9" transform="translate(0 32)" stroke-linejoin="round"/>
  <path d="M96 46H292V0L322 -32H398L428 0V46H624L666 80L682 130V328L640 368H80L38 328V130L54 80Z" stroke="#ffffff" stroke-width="3" opacity="0.32" transform="translate(0 30)" stroke-linejoin="round"/>
  `);
}

function boxDockSvg() {
  return svg(640, 228, `
  <rect x="0" y="0" width="640" height="228" rx="22" fill="#4969a1" opacity="0.16"/>
  <rect x="26" y="18" width="588" height="36" rx="18" fill="#ffffff" opacity="0.16"/>
  `);
}

function resultBadgeSvg(kind) {
  const isWin = kind === 'win';
  const fill = isWin ? '#ffd236' : '#ff6f9f';
  const dark = isWin ? '#c88410' : '#a73461';
  return svg(150, 150, `
  <circle cx="78" cy="84" r="64" fill="${dark}" opacity="0.28"/>
  <circle cx="75" cy="75" r="64" fill="${fill}"/>
  <circle cx="55" cy="53" r="20" fill="#ffffff" opacity="0.38"/>
  <circle cx="75" cy="75" r="60" stroke="#ffffff" stroke-width="6" opacity="0.46"/>
  `);
}

function levelBadgeSvg() {
  return svg(112, 140, `
  <rect x="0" y="8" width="112" height="132" rx="26" fill="#5a76a8"/>
  <rect x="0" y="0" width="112" height="132" rx="26" fill="#6f8fc8"/>
  <rect x="12" y="12" width="88" height="34" rx="18" fill="#ffffff" opacity="0.2"/>
  <rect x="2" y="2" width="108" height="128" rx="24" stroke="#ffffff" stroke-width="4" opacity="0.4"/>
  `);
}

function arrowButtonSvg() {
  return svg(72, 72, `
  <rect x="0" y="7" width="72" height="65" rx="20" fill="#d56d11"/>
  <rect x="0" y="0" width="72" height="65" rx="20" fill="#ffbd26"/>
  <rect x="8" y="8" width="56" height="20" rx="10" fill="#ffffff" opacity="0.25"/>
  <path d="M29 20L48 36L29 52" stroke="#ffffff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
  `);
}

function editorGridPanelSvg() {
  return svg(512, 512, `
  <rect x="0" y="0" width="512" height="512" rx="22" fill="#24243a" opacity="0.7"/>
  <rect x="1.5" y="1.5" width="509" height="509" rx="20" stroke="#ffffff" stroke-width="3" opacity="0.1"/>
  <g stroke="#3a3a55" stroke-width="2">
    ${Array.from({ length: 6 }, (_, i) => `<path d="M${i * 102.4} 0V512"/><path d="M0 ${i * 102.4}H512"/>`).join('')}
  </g>
  `);
}

writeAsset('background/sky.svg', 'Sky background', 'Plain game background color.', svg(720, 1280, '<rect width="720" height="1280" fill="#6f8fc8"/>'));
writeAsset('board/playfield-shell.svg', 'Playfield shell', 'Hand-drawn board shell with bottom inward mouth.', playfieldSvg());
writeAsset('board/wall-region-sample.svg', 'Wall region sample', 'Continuous dark wall region. The runtime merges wall cells into regions like this.', wallRegionSvg());
writeAsset('board/funnel-mouth.svg', 'Funnel mouth cut-in', 'Standalone editable version of the board bottom inward mouth.', svg(180, 150, `
  <path d="M0 0H180L136 68V150H44V68Z" fill="#38598e" opacity="0.18" transform="translate(0 8)"/>
  <path d="M0 0H180L136 68V150H44V68Z" fill="#f4f8ff" opacity="0.96"/>
  <path d="M0 0H180L136 68V150H44V68Z" stroke="#466aa0" stroke-width="10" stroke-linejoin="round" opacity="0.56"/>
  <path d="M20 14H160L124 68V126H56V68Z" stroke="#ffffff" stroke-width="3" opacity="0.3" stroke-linejoin="round"/>
  `));
writeAsset('board/conveyor-dock.svg', 'Conveyor dock', 'Rounded background panel that sits under the conveyor.', conveyorDockSvg());
writeAsset('board/box-column-dock.svg', 'Box column dock', 'Subtle background behind the box columns.', boxDockSvg());
writeAsset('conveyor/conveyor-track.svg', 'Conveyor track', 'Looping conveyor track without marbles.', conveyorTrackSvg());
writeAsset('conveyor/slot-empty.svg', 'Conveyor empty slot', 'Empty conveyor slot marker.', slotSvg(false));
writeAsset('conveyor/slot-occupied.svg', 'Conveyor occupied slot', 'Occupied conveyor slot marker.', slotSvg(true));
writeAsset('conveyor/output-port-empty.svg', 'Output port empty', 'Output port gate with no active top box color.', outputPortSvg());

for (const color of Object.keys(colors)) {
  writeAsset(`marbles/marble-${color}.svg`, `${colors[color].label} marble`, 'Single loose marble.', marbleSvg(color));
  writeAsset(`blocks/block-${color}-open.svg`, `${colors[color].label} open block`, 'Clickable block with visible internal 3x3 marbles.', blockSvg(color, 'open'));
  writeAsset(`blocks/block-${color}-covered.svg`, `${colors[color].label} covered block`, 'Blocked block without exposed internal marbles.', blockSvg(color, 'covered'));
  writeAsset(`boxes/box-${color}-empty.svg`, `${colors[color].label} empty box`, 'Box with empty receiving slots.', boxSvg(color, false));
  writeAsset(`boxes/box-${color}-full.svg`, `${colors[color].label} full box`, 'Box with all three receiving slots filled.', boxSvg(color, true));
  writeAsset(`conveyor/output-port-${color}.svg`, `${colors[color].label} output port`, 'Output port gate for a matching top box color.', outputPortSvg(color));
  writeAsset(`ui/swatch-${color}.svg`, `${colors[color].label} swatch`, 'Editor color swatch.', swatchSvg(color));
}

writeAsset('blocks/block-hidden.svg', 'Hidden block', 'Covered hidden block with question mark.', hiddenBlockSvg());
writeAsset('ui/button-primary.svg', 'Primary button background', 'Purple rounded button background without text.', roundedButton({ width: 400, height: 86, fill: '#a66bf0', dark: '#7442ba', radius: 28 }));
writeAsset('ui/button-accent.svg', 'Accent button background', 'Yellow rounded button background without text.', roundedButton({ width: 430, height: 112, fill: '#ffbd26', dark: '#e88712', radius: 36 }));
writeAsset('ui/back-button.svg', 'Back button background', 'Small square rounded back button background without text.', roundedButton({ width: 80, height: 80, fill: '#a66bf0', dark: '#7442ba', radius: 18 }));
writeAsset('ui/hud-pill.svg', 'HUD pill background', 'Top HUD pill background without text.', roundedButton({ width: 230, height: 58, fill: '#a66bf0', dark: '#7442ba', radius: 29 }));
writeAsset('ui/panel.svg', 'Panel background', 'Generic blue-white rounded panel.', panelSvg(600, 240, 34));
writeAsset('ui/level-card.svg', 'Level card background', 'Level select card background without text.', panelSvg(620, 160, 30));
writeAsset('ui/level-badge.svg', 'Level badge background', 'Level card number badge background without text.', levelBadgeSvg());
writeAsset('ui/arrow-button.svg', 'Arrow button', 'Level card arrow button.', arrowButtonSvg());
writeAsset('ui/toast-panel.svg', 'Toast panel', 'Floating tutorial toast background without text.', panelSvg(600, 84, 24));
writeAsset('ui/game-over-panel.svg', 'Game over panel', 'Large result panel background.', panelSvg(576, 548, 40));
writeAsset('ui/result-badge-win.svg', 'Win result badge', 'Round badge used for win state.', resultBadgeSvg('win'));
writeAsset('ui/result-badge-lose.svg', 'Lose result badge', 'Round badge used for lose state.', resultBadgeSvg('lose'));
writeAsset('ui/editor-grid-panel.svg', 'Editor grid panel', 'Editor grid background panel.', editorGridPanelSvg());
writeAsset('ui/icon-gear.svg', 'Gear icon', 'Menu settings gear icon.', svg(64, 64, `
  <circle cx="32" cy="32" r="16" fill="#ffffff"/>
  <circle cx="32" cy="32" r="7" fill="#7442ba"/>
  <path d="M29 4H35L38 16L50 11L54 16L47 27L60 30V36L47 39L54 50L50 54L38 48L35 60H29L26 48L14 54L10 50L17 39L4 36V30L17 27L10 16L14 11L26 16Z" fill="#ffffff"/>
  <circle cx="32" cy="32" r="25" stroke="#7442ba" stroke-width="5"/>
  `));
writeAsset('ui/icon-plus.svg', 'Plus icon', 'Add button plus icon.', svg(64, 64, `
  <rect x="27" y="10" width="10" height="44" rx="5" fill="#ffffff"/>
  <rect x="10" y="27" width="44" height="10" rx="5" fill="#ffffff"/>
  `));
writeAsset('ui/icon-lock.svg', 'Lock icon', 'Locked level icon.', svg(64, 64, `
  <rect x="14" y="28" width="36" height="28" rx="8" fill="#ffffff" stroke="#555b70" stroke-width="4"/>
  <path d="M22 30V22C22 14 26 9 32 9C38 9 42 14 42 22V30" stroke="#555b70" stroke-width="6" stroke-linecap="round"/>
  <circle cx="32" cy="40" r="6" fill="#555b70"/>
  <rect x="29" y="40" width="6" height="10" rx="3" fill="#555b70"/>
  `));

const readme = `# Marble Sort Art Assets

This folder contains editable SVG exports of the game's procedural art.

- Run \`npm run render:art\` to regenerate the full set.
- Edit or replace SVG files directly when iterating on art.
- \`manifest.json\` maps each file to its intended in-game role.
- \`contact-sheet.html\` previews every asset in a browser.

The current runtime still draws most objects procedurally. These files are the
replaceable art source exports, ready to be wired into the Phaser scenes if the
project moves to a texture-driven pipeline.
`;
writeAsset('README.md', 'README', 'How to use these generated assets.', readme, { register: false });

const manifestJson = JSON.stringify({ generatedBy: 'scripts/render-art-assets.mjs', assets: manifest }, null, 2);
writeAsset('manifest.json', 'Manifest', 'Generated asset manifest.', manifestJson, { register: false });

const cards = manifest
  .filter((item) => item.path.endsWith('.svg'))
  .map((item) => {
    const relative = item.path.replace('assets/art/', '');
    return `<section><img src="./${relative}" alt="${item.label}"><h2>${item.label}</h2><p>${relative}</p></section>`;
  })
  .join('\n');
const contactSheet = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Marble Sort Art Contact Sheet</title>
  <style>
    body { margin: 0; padding: 24px; background: #6f8fc8; color: #18345f; font-family: Arial, Helvetica, sans-serif; }
    main { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; }
    section { background: #e4f2f8; border: 3px solid #4969a1; border-radius: 12px; padding: 12px; min-height: 190px; }
    img { display: block; width: 100%; height: 112px; object-fit: contain; background: #ffffff66; border-radius: 8px; }
    h1 { margin: 0 0 18px; color: #fff; text-shadow: 0 3px #2f4c82; }
    h2 { margin: 10px 0 4px; font-size: 15px; }
    p { margin: 0; font-size: 12px; overflow-wrap: anywhere; }
  </style>
</head>
<body>
  <h1>Marble Sort Art Contact Sheet</h1>
  <main>
${cards}
  </main>
</body>
</html>`;
writeAsset('contact-sheet.html', 'Contact sheet', 'Browser preview of generated SVG assets.', contactSheet, { register: false });

console.log(`rendered ${manifest.length} SVG art assets into ${OUT}`);
