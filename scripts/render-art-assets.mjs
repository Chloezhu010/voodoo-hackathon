/* eslint-disable max-lines */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const OUT = join(ROOT, 'assets', 'art');

const colors = {
  pink: { hex: '#ff5aa7', dark: '#d43a7d', deep: '#9a2257', label: 'Pink' },
  blue: { hex: '#315cf6', dark: '#1745ce', deep: '#1030a1', label: 'Blue' },
  green: { hex: '#18d84f', dark: '#0aa83b', deep: '#08752d', label: 'Green' },
  yellow: { hex: '#fff300', dark: '#d8b600', deep: '#a47a00', label: 'Yellow' },
  purple: { hex: '#b66bf2', dark: '#7b35bc', deep: '#55228e', label: 'Purple' },
  orange: { hex: '#ffa407', dark: '#f06a05', deep: '#b84000', label: 'Orange' },
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
  <rect x="8" y="10" width="${width - 4}" height="${height - 10}" rx="${radius}" fill="#24325f" opacity="0.38"/>
  <rect x="0" y="7" width="${width}" height="${height - 7}" rx="${radius}" fill="${dark}"/>
  <rect x="0" y="0" width="${width}" height="${height - 10}" rx="${radius}" fill="${fill}"/>
  <rect x="8" y="7" width="${width - 22}" height="${Math.round(height * 0.34)}" rx="${Math.round(radius * 0.65)}" fill="#ffffff" opacity="0.25"/>
  <rect x="2" y="2" width="${width - 4}" height="${height - 14}" rx="${radius - 2}" stroke="${stroke}" stroke-width="4" opacity="0.52"/>
  <path d="M${Math.round(width * 0.08)} ${height - 16}H${Math.round(width * 0.9)}" stroke="#000000" stroke-width="5" opacity="0.08" stroke-linecap="round"/>
  `);
}

function panelSvg(width, height, radius = 34) {
  return svg(width, height, `
  <rect x="10" y="16" width="${width - 20}" height="${height - 20}" rx="${radius}" fill="#384f84" opacity="0.28"/>
  <rect x="4" y="4" width="${width - 8}" height="${height - 14}" rx="${radius}" fill="#d7e0f1"/>
  <rect x="18" y="16" width="${width - 36}" height="${Math.max(28, Math.round(height * 0.2))}" rx="${Math.max(12, radius - 8)}" fill="#ffffff" opacity="0.28"/>
  <rect x="7" y="7" width="${width - 14}" height="${height - 20}" rx="${radius - 2}" stroke="#506ea0" stroke-width="6" opacity="0.88"/>
  `);
}

function marbleSvg(color) {
  const c = colors[color];
  return svg(40, 40, `
  <circle cx="23" cy="24" r="15" fill="#18265a" opacity="0.26"/>
  <circle cx="20" cy="20" r="14" fill="${c.dark}"/>
  <circle cx="20" cy="18" r="13" fill="${c.hex}"/>
  <circle cx="15" cy="13" r="5" fill="#ffffff" opacity="0.32"/>
  <path d="M9 22C13 29 27 31 32 21" stroke="#000000" stroke-width="4" opacity="0.08" stroke-linecap="round"/>
  <circle cx="20" cy="18" r="13" stroke="#1f2340" stroke-width="1.5" opacity="0.24"/>
  `);
}

function blockSvg(color, variant) {
  const c = colors[color];
  const isCovered = variant === 'covered';
  const showMarbles = variant === 'open';
  const overlay = isCovered ? '<rect x="2" y="2" width="92" height="88" rx="16" fill="#243a72" opacity="0.3"/>' : '';
  const marbles = showMarbles ? Array.from({ length: 9 }, (_, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const cx = 27 + col * 21;
    const cy = 27 + row * 20;
    return `
  <circle cx="${cx + 1}" cy="${cy + 3}" r="10.5" fill="${c.deep}" opacity="0.3"/>
  <circle cx="${cx}" cy="${cy}" r="10.5" fill="${c.hex}"/>
  <circle cx="${cx - 3}" cy="${cy - 4}" r="3.3" fill="#ffffff" opacity="0.2"/>`;
  }).join('') : '';

  return svg(96, 96, `
  <rect x="6" y="10" width="88" height="86" rx="16" fill="#1b2a5a" opacity="0.22"/>
  <rect x="1.5" y="6.5" width="93" height="88" rx="16" fill="${c.deep}" stroke="#171723" stroke-width="3"/>
  <rect x="1.5" y="1.5" width="93" height="88" rx="16" fill="${c.hex}" stroke="#1a1b2a" stroke-width="3"/>
  <path d="M14 6H74C83 6 90 13 90 22V29C70 37 24 37 7 27V21C7 13 10 8 14 6Z" fill="#ffffff" opacity="0.13"/>
  <rect x="5" y="68" width="86" height="18" rx="9" fill="${c.deep}" opacity="0.22"/>
  <rect x="11" y="13" width="74" height="68" rx="13" fill="${c.dark}" opacity="${showMarbles ? 0.56 : 0}"/>
  <rect x="14" y="16" width="68" height="16" rx="8" fill="#ffffff" opacity="${showMarbles ? 0.08 : 0}"/>
  ${marbles}
  <rect x="11" y="13" width="74" height="68" rx="13" stroke="#1a1b2a" stroke-width="2.5" opacity="${showMarbles ? 0.34 : 0}"/>
  <rect x="4" y="3" width="88" height="84" rx="14" stroke="#ffffff" stroke-width="2.5" opacity="0.18"/>
  ${overlay}
  `);
}

function hiddenBlockSvg() {
  return svg(96, 96, `
  <rect x="6" y="10" width="88" height="86" rx="16" fill="#1b2a5a" opacity="0.22"/>
  <rect x="1.5" y="6.5" width="93" height="88" rx="16" fill="#8899a8" stroke="#555b70" stroke-width="3"/>
  <rect x="1.5" y="1.5" width="93" height="88" rx="16" fill="#bbc8c3" stroke="#555b70" stroke-width="3"/>
  <path d="M14 6H74C83 6 90 13 90 22V30C70 38 25 38 7 28V21C7 13 10 8 14 6Z" fill="#ffffff" opacity="0.16"/>
  <circle cx="48" cy="45" r="25" fill="#ffffff" opacity="0.16"/>
  <text x="48" y="64" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="52" font-weight="800" fill="#ffffff" stroke="#555b70" stroke-width="6" paint-order="stroke">?</text>
  <rect x="4" y="3" width="88" height="84" rx="14" stroke="#ffffff" stroke-width="2.5" opacity="0.2"/>
  `);
}

function boxSvg(color, filled = false) {
  const c = colors[color];
  const balls = [28, 50, 72].map((x) => {
    if (!filled) {
      return `
  <circle cx="${x}" cy="20" r="12" fill="${c.deep}" opacity="0.48"/>
  <circle cx="${x - 3}" cy="16" r="5" fill="#ffffff" opacity="0.08"/>`;
    }
    return `
  <circle cx="${x + 1}" cy="23" r="12" fill="${c.deep}" opacity="0.3"/>
  <circle cx="${x}" cy="20" r="12" fill="${c.hex}"/>
  <circle cx="${x - 4}" cy="16" r="4" fill="#ffffff" opacity="0.24"/>`;
  }).join('');

  return svg(100, 50, `
  <rect x="4" y="6" width="96" height="44" rx="9" fill="#1b2a5a" opacity="0.2"/>
  <rect x="1.5" y="5.5" width="97" height="43" rx="8" fill="${c.dark}" stroke="#15151d" stroke-width="3"/>
  <rect x="1.5" y="1.5" width="97" height="43" rx="8" fill="${c.hex}" stroke="#15151d" stroke-width="3"/>
  <rect x="7" y="5" width="86" height="10" rx="5" fill="#ffffff" opacity="0.1"/>
  <rect x="5" y="34" width="90" height="8" rx="4" fill="${c.deep}" opacity="0.18"/>
  ${balls}
  `);
}

function outputPortSvg(color = null) {
  const fill = color ? colors[color].hex : '#d8e0f1';
  const stroke = color ? '#1a1b2a' : '#506ea0';
  return svg(90, 48, `
  <path d="M6 13H84L45 45Z" fill="#24325f" opacity="0.24"/>
  <path d="M6 4H84L45 36Z" fill="${fill}" opacity="0.95" stroke="${stroke}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M20 9H70" stroke="#ffffff" stroke-width="4" opacity="0.2" stroke-linecap="round"/>
  `);
}

function playfieldSvg() {
  return svg(720, 1148, `
  <path d="M92 126L626 130C654 132 674 148 674 168L686 632L676 666L646 696L500 724L454 746L426 780V812H624L666 846L682 892V1088L640 1128H80L38 1088V892L54 846L96 812H294V780L266 746L220 724L76 696L44 666L34 632L48 166C49 144 66 126 92 126Z" fill="#314d83" opacity="0.26" transform="translate(0 16)"/>
  <path d="M92 126L626 130C654 132 674 148 674 168L686 632L676 666L646 696L500 724L454 746L426 780V812H624L666 846L682 892V1088L640 1128H80L38 1088V892L54 846L96 812H294V780L266 746L220 724L76 696L44 666L34 632L48 166C49 144 66 126 92 126Z" fill="#d4def2"/>
  <path d="M92 126L626 130C654 132 674 148 674 168L686 632L676 666L646 696L500 724L454 746L426 780V812H624L666 846L682 892V1088L640 1128H80L38 1088V892L54 846L96 812H294V780L266 746L220 724L76 696L44 666L34 632L48 166C49 144 66 126 92 126Z" stroke="#3e5f98" stroke-width="22" opacity="0.52" transform="translate(0 10)" stroke-linejoin="round"/>
  <path d="M92 126L626 130C654 132 674 148 674 168L686 632L676 666L646 696L500 724L454 746L426 780V812H624L666 846L682 892V1088L640 1128H80L38 1088V892L54 846L96 812H294V780L266 746L220 724L76 696L44 666L34 632L48 166C49 144 66 126 92 126Z" stroke="#466aa0" stroke-width="14" stroke-linejoin="round"/>
  <path d="M92 156H620C636 156 648 168 648 184L660 614L642 640L614 654H494C470 654 450 674 450 698V756C450 780 470 800 494 800H610C636 800 658 818 666 842L682 892V1088L640 1128H80L38 1088V892L54 846C62 820 84 800 110 800H226C250 800 270 780 270 756V698C270 674 250 654 226 654H106L72 634L60 612L74 184C74 168 82 156 92 156Z" fill="#a8c4d1"/>
  <path d="M92 184H616C630 184 640 194 640 208L652 596C652 616 634 632 612 632H494C456 632 426 662 426 700V756C426 795 456 824 494 824H600C624 824 644 840 652 862L662 904V1058L606 1084H114L58 1058V904L68 864C76 842 96 824 120 824H226C264 824 294 795 294 756V700C294 662 264 632 226 632H108C86 632 68 616 68 594L80 208C80 194 84 184 92 184Z" fill="#c3d7e1" opacity="0.36"/>
  <path d="M60 620H230C268 620 300 652 300 690V750C300 776 290 798 268 812L88 840" stroke="#7395ac" stroke-width="10" opacity="0.45" stroke-linecap="round"/>
  <path d="M660 620H490C452 620 420 652 420 690V750C420 776 430 798 452 812L632 840" stroke="#7395ac" stroke-width="10" opacity="0.45" stroke-linecap="round"/>
  <path d="M104 126H620C650 126 674 148 674 178L686 632" stroke="#d7ecf4" stroke-width="4" opacity="0.24" stroke-linecap="round"/>
  `);
}

function wallRegionSvg() {
  return svg(520, 360, `
  <path d="M104 24H416V120H360V216H464V312H256V216H208V312H56V120H104Z" fill="#94b3c2" opacity="0.4"/>
  <path d="M104 24H416V120H360V216H464V312H256V216H208V312H56V120H104Z" stroke="#3c607a" stroke-width="18" opacity="0.28" transform="translate(0 10)" stroke-linejoin="round"/>
  <path d="M104 24H416V120H360V216H464V312H256V216H208V312H56V120H104Z" stroke="#3f637a" stroke-width="8" stroke-linejoin="round"/>
  <path d="M104 24H416V120H360V216H464V312H256V216H208V312H56V120H104Z" stroke="#d7ecf4" stroke-width="3" opacity="0.22" transform="translate(0 -2)" stroke-linejoin="round"/>
  `);
}

function conveyorTrackSvg() {
  return svg(640, 320, `
  <path d="M78 92H562A68 68 0 0 1 562 228H78A68 68 0 0 1 78 92Z" fill="#3d5d93" opacity="0.28" transform="translate(0 10)"/>
  <path d="M78 92H562A68 68 0 0 1 562 228H78A68 68 0 0 1 78 92Z" fill="#f4f6ff"/>
  <path d="M82 103H558A57 57 0 0 1 558 217H82A57 57 0 0 1 82 103Z" fill="#9a9dad"/>
  <path d="M95 118H545A42 42 0 0 1 545 202H95A42 42 0 0 1 95 118Z" fill="#74788a"/>
  <rect x="112" y="151" width="416" height="19" rx="10" fill="#5b6074" opacity="0.42"/>
  <rect x="102" y="146" width="436" height="17" rx="9" fill="#ffffff"/>
  <rect x="114" y="151" width="412" height="6" rx="3" fill="#d7dbe8"/>
  <path d="M78 92H562A68 68 0 0 1 562 228H78A68 68 0 0 1 78 92Z" stroke="#ffffff" stroke-width="5" opacity="0.9"/>
  <path d="M82 103H558A57 57 0 0 1 558 217H82A57 57 0 0 1 82 103Z" stroke="#686d7f" stroke-width="4" opacity="0.5"/>
  `);
}

function slotSvg(occupied = false) {
  return svg(32, 32, `
  <circle cx="16" cy="16" r="13" fill="${occupied ? '#ffffff' : '#565b70'}" opacity="${occupied ? 0.18 : 1}"/>
  <circle cx="13" cy="12" r="8" fill="#ffffff" opacity="${occupied ? 0.22 : 0.1}"/>
  <circle cx="16" cy="16" r="12" stroke="#ffffff" stroke-width="2" opacity="${occupied ? 0.42 : 0.18}"/>
  `);
}

function swatchSvg(color) {
  const c = colors[color];
  return svg(64, 64, `
  <rect x="5" y="7" width="56" height="56" rx="12" fill="#1b2a5a" opacity="0.22"/>
  <rect x="2" y="5" width="60" height="56" rx="12" fill="${c.dark}" stroke="#1a1b2a" stroke-width="3"/>
  <rect x="2" y="2" width="60" height="56" rx="12" fill="${c.hex}" stroke="#1a1b2a" stroke-width="3"/>
  <rect x="9" y="8" width="46" height="14" rx="7" fill="#ffffff" opacity="0.16"/>
  `);
}

function conveyorDockSvg() {
  return svg(720, 420, `
  <path d="M96 46H294V18L322 -14H398L426 18V46H624L666 80L682 130V328L640 368H80L38 328V130L54 80Z" fill="#314d83" opacity="0.24" transform="translate(0 14)"/>
  <path d="M96 46H294V18L322 -14H398L426 18V46H624L666 80L682 130V328L640 368H80L38 328V130L54 80Z" fill="#d5def2" transform="translate(0 32)"/>
  <path d="M118 66H602L632 94L642 130H78L88 94Z" fill="#ffffff" opacity="0.2" transform="translate(0 32)"/>
  <path d="M96 46H294V18L322 -14H398L426 18V46H624L666 80L682 130V328L640 368H80L38 328V130L54 80Z" stroke="#3e5f98" stroke-width="18" opacity="0.44" transform="translate(0 42)" stroke-linejoin="round"/>
  <path d="M96 46H294V18L322 -14H398L426 18V46H624L666 80L682 130V328L640 368H80L38 328V130L54 80Z" stroke="#4969a1" stroke-width="10" opacity="0.9" transform="translate(0 32)" stroke-linejoin="round"/>
  <path d="M96 46H294V18L322 -14H398L426 18V46H624L666 80L682 130V328L640 368H80L38 328V130L54 80Z" stroke="#ffffff" stroke-width="3" opacity="0.26" transform="translate(0 30)" stroke-linejoin="round"/>
  `);
}

function boxDockSvg() {
  return svg(640, 228, `
  <rect x="0" y="0" width="640" height="228" rx="22" fill="#d6def3" opacity="0.96"/>
  <rect x="0" y="0" width="640" height="228" rx="22" stroke="#4969a1" stroke-width="8" opacity="0.25"/>
  <rect x="28" y="20" width="584" height="36" rx="18" fill="#ffffff" opacity="0.18"/>
  `);
}

function resultBadgeSvg(kind) {
  const isWin = kind === 'win';
  const fill = isWin ? '#ffcc28' : '#ff6f9f';
  const dark = isWin ? '#d56d11' : '#a73461';
  return svg(150, 150, `
  <circle cx="80" cy="86" r="64" fill="#24325f" opacity="0.28"/>
  <circle cx="75" cy="78" r="64" fill="${dark}"/>
  <circle cx="75" cy="72" r="62" fill="${fill}"/>
  <circle cx="55" cy="51" r="18" fill="#ffffff" opacity="0.32"/>
  <circle cx="75" cy="72" r="58" stroke="#ffffff" stroke-width="6" opacity="0.42"/>
  `);
}

function levelBadgeSvg() {
  return svg(112, 140, `
  <rect x="6" y="10" width="104" height="128" rx="24" fill="#24325f" opacity="0.26"/>
  <rect x="0" y="6" width="112" height="128" rx="24" fill="#7b35bc"/>
  <rect x="0" y="0" width="112" height="128" rx="24" fill="#b66bf2"/>
  <rect x="11" y="10" width="90" height="34" rx="17" fill="#ffffff" opacity="0.23"/>
  <rect x="2" y="2" width="108" height="124" rx="22" stroke="#e8bbff" stroke-width="4" opacity="0.5"/>
  `);
}

function arrowButtonSvg() {
  return svg(72, 72, `
  <rect x="5" y="8" width="66" height="64" rx="18" fill="#24325f" opacity="0.28"/>
  <rect x="0" y="5" width="72" height="64" rx="18" fill="#d56d11" stroke="#572051" stroke-width="3"/>
  <rect x="0" y="0" width="72" height="64" rx="18" fill="#ffbd26" stroke="#572051" stroke-width="3"/>
  <rect x="9" y="7" width="54" height="18" rx="9" fill="#ffffff" opacity="0.22"/>
  <path d="M29 19L49 32L29 45" stroke="#fff4cf" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
  `);
}

function lockedLevelCardSvg() {
  return svg(160, 160, `
  <rect x="10" y="12" width="140" height="140" rx="28" fill="#384f84" opacity="0.2"/>
  <rect x="3" y="5" width="154" height="148" rx="28" fill="#9caeaa"/>
  <rect x="3" y="0" width="154" height="148" rx="28" fill="#bccbc6"/>
  <rect x="14" y="10" width="132" height="34" rx="17" fill="#ffffff" opacity="0.14"/>
  <rect x="5" y="2" width="150" height="144" rx="26" stroke="#9aaca8" stroke-width="5"/>
  <rect x="58" y="61" width="44" height="37" rx="10" fill="#ffffff" stroke="#555b70" stroke-width="5"/>
  <path d="M66 63V52C66 41 72 34 80 34C88 34 94 41 94 52V63" stroke="#555b70" stroke-width="7" stroke-linecap="round"/>
  <circle cx="80" cy="78" r="7" fill="#555b70"/>
  <rect x="76" y="78" width="8" height="14" rx="4" fill="#555b70"/>
  `);
}

function coinSvg() {
  return svg(64, 64, `
  <circle cx="34" cy="35" r="27" fill="#7a4a00" opacity="0.25"/>
  <circle cx="32" cy="32" r="27" fill="#f07b00" stroke="#9a5400" stroke-width="3"/>
  <circle cx="32" cy="30" r="22" fill="#ffcb22"/>
  <path d="M22 48C31 53 47 46 51 31" stroke="#f48600" stroke-width="8" opacity="0.55" stroke-linecap="round"/>
  <ellipse cx="25" cy="22" rx="8" ry="13" fill="#fff07c" opacity="0.75" transform="rotate(25 25 22)"/>
  <circle cx="32" cy="30" r="19" stroke="#fff067" stroke-width="3" opacity="0.55"/>
  `);
}

function settingsButtonSvg() {
  return svg(110, 110, `
  <rect x="10" y="12" width="96" height="96" rx="24" fill="#24325f" opacity="0.36"/>
  <rect x="0" y="8" width="100" height="96" rx="24" fill="#5b238d" stroke="#342052" stroke-width="4"/>
  <rect x="0" y="0" width="100" height="96" rx="24" fill="#b66bf2" stroke="#5b238d" stroke-width="4"/>
  <rect x="10" y="8" width="78" height="26" rx="13" fill="#ffffff" opacity="0.22"/>
  <path d="M46 19H56L60 32L73 27L80 36L72 48L86 53V63L72 67L79 80L71 87L60 80L55 93H45L41 80L28 86L21 78L29 67L15 62V52L29 48L21 35L29 28L41 33Z" fill="#ffffff" stroke="#6d2eab" stroke-width="4" stroke-linejoin="round"/>
  <circle cx="50" cy="56" r="13" fill="#6d2eab"/>
  <circle cx="50" cy="56" r="7" fill="#ffffff"/>
  `);
}

function plusButtonSvg() {
  return svg(96, 96, `
  <rect x="6" y="8" width="88" height="88" rx="22" fill="#24325f" opacity="0.32"/>
  <rect x="0" y="6" width="92" height="86" rx="22" fill="#d56d11" stroke="#572051" stroke-width="4"/>
  <rect x="0" y="0" width="92" height="86" rx="22" fill="#ffbd26" stroke="#572051" stroke-width="4"/>
  <rect x="9" y="8" width="72" height="24" rx="12" fill="#ffffff" opacity="0.22"/>
  <path d="M46 20V67M23 44H69" stroke="#fff4cf" stroke-width="10" stroke-linecap="round"/>
  <path d="M46 20V67M23 44H69" stroke="#d56d11" stroke-width="4" stroke-linecap="round"/>
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

writeAsset('background/sky.svg', 'Sky background', 'Plain game background color.', svg(720, 1280, '<rect width="720" height="1280" fill="#6d8bc4"/>'));
writeAsset('board/playfield-shell.svg', 'Playfield shell', 'Hand-drawn board shell with bottom inward mouth.', playfieldSvg());
writeAsset('board/wall-region-sample.svg', 'Wall region sample', 'Continuous dark wall region. The runtime merges wall cells into regions like this.', wallRegionSvg());
writeAsset('board/funnel-mouth.svg', 'Neck opening guide', 'Standalone editable guide for the smooth board neck opening.', svg(220, 170, `
  <path d="M0 0L62 26L92 62V118H128V62L158 26L220 0V170H0Z" fill="#d4def2"/>
  <path d="M0 0L62 26L92 62V118H128V62L158 26L220 0V170H0Z" stroke="#466aa0" stroke-width="10" stroke-linejoin="round"/>
  <path d="M28 22L74 44L104 78V128H116V78L146 44L192 22" stroke="#ffffff" stroke-width="8" opacity="0.32" stroke-linecap="round" stroke-linejoin="round"/>
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
writeAsset('ui/button-primary.svg', 'Primary button background', 'Purple rounded button background without text.', roundedButton({ width: 400, height: 86, fill: '#b66bf2', dark: '#7b35bc', stroke: '#e0b8ff', radius: 28 }));
writeAsset('ui/button-accent.svg', 'Accent button background', 'Yellow rounded button background without text.', roundedButton({ width: 430, height: 112, fill: '#ffbd26', dark: '#d56d11', stroke: '#572051', radius: 30 }));
writeAsset('ui/back-button.svg', 'Back button background', 'Small square rounded back button background without text.', roundedButton({ width: 80, height: 80, fill: '#b66bf2', dark: '#7b35bc', stroke: '#572051', radius: 18 }));
writeAsset('ui/hud-pill.svg', 'HUD pill background', 'Top HUD pill background without text.', roundedButton({ width: 230, height: 58, fill: '#b66bf2', dark: '#7b35bc', stroke: '#ddb7ff', radius: 20 }));
writeAsset('ui/panel.svg', 'Panel background', 'Generic blue-white rounded panel.', panelSvg(600, 240, 34));
writeAsset('ui/level-card.svg', 'Level card background', 'Level select card background without text.', panelSvg(620, 160, 30));
writeAsset('ui/locked-level-card.svg', 'Locked level card', 'Reference-style locked level card.', lockedLevelCardSvg());
writeAsset('ui/level-badge.svg', 'Level badge background', 'Level card number badge background without text.', levelBadgeSvg());
writeAsset('ui/arrow-button.svg', 'Arrow button', 'Level card arrow button.', arrowButtonSvg());
writeAsset('ui/toast-panel.svg', 'Toast panel', 'Floating tutorial toast background without text.', panelSvg(600, 84, 24));
writeAsset('ui/game-over-panel.svg', 'Game over panel', 'Large result panel background.', panelSvg(576, 548, 40));
writeAsset('ui/result-badge-win.svg', 'Win result badge', 'Round badge used for win state.', resultBadgeSvg('win'));
writeAsset('ui/result-badge-lose.svg', 'Lose result badge', 'Round badge used for lose state.', resultBadgeSvg('lose'));
writeAsset('ui/editor-grid-panel.svg', 'Editor grid panel', 'Editor grid background panel.', editorGridPanelSvg());
writeAsset('ui/coin.svg', 'Coin', 'HUD coin token matching the reference top bar.', coinSvg());
writeAsset('ui/settings-button.svg', 'Settings button', 'Top-left purple settings button with gear.', settingsButtonSvg());
writeAsset('ui/plus-button.svg', 'Plus button', 'Top-right yellow add button.', plusButtonSvg());
writeAsset('ui/icon-gear.svg', 'Gear icon', 'Menu settings gear icon.', svg(64, 64, `
  <path d="M28 5H36L39 18L51 13L56 20L49 31L61 36V44L49 47L55 58L49 63L38 56L35 68H27L24 56L12 62L7 55L15 45L3 40V32L16 29L9 18L15 12L26 18Z" fill="#6d2eab" opacity="0.55" transform="translate(0 -3)"/>
  <path d="M28 2H36L39 15L51 10L56 17L49 28L61 33V41L49 44L55 55L49 60L38 53L35 65H27L24 53L12 59L7 52L15 42L3 37V29L16 26L9 15L15 9L26 15Z" fill="#ffffff"/>
  <circle cx="32" cy="33" r="14" fill="#6d2eab"/>
  <circle cx="32" cy="33" r="7" fill="#ffffff"/>
  `));
writeAsset('ui/icon-plus.svg', 'Plus icon', 'Add button plus icon.', svg(64, 64, `
  <path d="M32 9V55M9 32H55" stroke="#fff4cf" stroke-width="13" stroke-linecap="round"/>
  <path d="M32 9V55M9 32H55" stroke="#d56d11" stroke-width="5" stroke-linecap="round"/>
  `));
writeAsset('ui/icon-lock.svg', 'Lock icon', 'Locked level icon.', svg(64, 64, `
  <rect x="14" y="29" width="36" height="29" rx="8" fill="#ffffff" stroke="#555b70" stroke-width="4"/>
  <path d="M22 31V22C22 13 26 8 32 8C38 8 42 13 42 22V31" stroke="#555b70" stroke-width="6" stroke-linecap="round"/>
  <circle cx="32" cy="42" r="6" fill="#555b70"/>
  <rect x="29" y="42" width="6" height="10" rx="3" fill="#555b70"/>
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
    body { margin: 0; padding: 24px; background: #6d8bc4; color: #18345f; font-family: Arial, Helvetica, sans-serif; }
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
