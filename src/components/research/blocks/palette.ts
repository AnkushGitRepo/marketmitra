/** Series and slice colours, from the design tokens. Neighbouring entries are told apart by lightness as well as hue. */
export const SERIES_COLORS: readonly string[] = [
  'var(--app-ink)',
  'var(--app-teal)',
  'var(--app-warn-accent)',
  'var(--color-violet-text, #40389c)',
  'var(--app-loss-soft)',
  'var(--app-teal-strong)',
  'var(--app-text-faint)',
  'var(--app-border)',
];

export const seriesColor = (index: number): string => SERIES_COLORS[index % SERIES_COLORS.length];
