// CSS-string mirrors of the canvas UI palette so the DOM overlay stays in
// visual sync with Phaser-side colors without duplicating numeric values.

export const BRIEF_TOKENS = {
  surface: '#f5fbff',
  surfaceMuted: '#eaf4ff',
  surfaceWarn: '#fff4d8',
  surfaceOk: '#ecfdf3',
  surfaceErr: '#ffe1e8',
  textStrong: '#24406f',
  textMuted: '#5f78a8',
  textFaint: '#8497bd',
  textOk: '#047857',
  textOnPrimary: '#ffffff',
  border: 'rgba(73, 105, 161, 0.18)',
  borderStrong: 'rgba(73, 105, 161, 0.32)',
  primary: '#7b35bc',
  primaryHover: '#6a2aa8',
  panelDark: '#46659d',
  accent: '#d56d11',
  infoBlue: '#2563eb',
  shadow: '0 12px 32px -16px rgba(50, 75, 130, 0.55)',
  // Mirror the Phaser canvas text family (index.html body font) so the DOM
  // overlay reads as the same product as the editor toolbar/blocks. Display
  // and body share the family — hierarchy comes from weight + size, not family.
  fontDisplay: '"Helvetica Neue", Arial, Helvetica, sans-serif',
  fontBody: '"Helvetica Neue", Arial, Helvetica, sans-serif',
} as const;

export const VERDICT_COLORS = {
  ship: '#059669',
  iterate: '#d56d11',
  cut: '#dc2626',
} as const;

export const SEVERITY_COLORS = {
  low: '#2563eb',
  medium: '#d56d11',
  high: '#dc2626',
} as const;

export const PRIORITY_COLORS = {
  must: '#dc2626',
  should: '#d56d11',
  could: '#2563eb',
} as const;
