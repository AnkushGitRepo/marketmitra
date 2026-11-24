// What the model picker shows, with no server-only imports so the browser can use it (#333). The server merges live data into this shape
// in `modelList.ts`; the browser starts from the curated list and swaps in the live one when it arrives.

import { PROVIDERS, TIER_LABELS, type AiProvider, type CatalogModel, type ModelTier } from './providerCatalog';

export interface PickerModel {
  readonly value: string;
  readonly label: string;
  readonly tier: ModelTier;
  /** A $0 model or a free tier. */
  readonly free: boolean;
  /** Whether the model is known to support tool calls (Mitra needs them): true, false, or null when the provider does not say. */
  readonly tools: boolean | null;
}

export interface ModelListResult {
  readonly source: 'live' | 'curated';
  readonly models: readonly PickerModel[];
}

export const fromCatalog = (m: CatalogModel, tools: boolean | null = null): PickerModel => ({ value: m.value, label: m.label, tier: m.tier, free: m.tier === 'free', tools });

export function curatedList(provider: AiProvider): ModelListResult {
  return { source: 'curated', models: PROVIDERS[provider].models.map((m) => fromCatalog(m)) };
}

const TIER_ORDER: readonly ModelTier[] = ['latest', 'free', 'other'];

export interface PickerGroup {
  readonly tier: ModelTier;
  readonly label: string;
  readonly models: readonly PickerModel[];
  /** How many matched but are not shown, so the picker can say "keep typing". */
  readonly hidden: number;
}

/** Models matching `query` (label or id), grouped Latest / Free / Other, each group capped at `limit`. */
export function groupForPicker(models: readonly PickerModel[], query: string, limit = 60): PickerGroup[] {
  const q = query.trim().toLowerCase();
  const matching = q ? models.filter((m) => m.label.toLowerCase().includes(q) || m.value.toLowerCase().includes(q)) : models;
  return TIER_ORDER.map((tier) => {
    const all = matching.filter((m) => m.tier === tier);
    return { tier, label: TIER_LABELS[tier], models: all.slice(0, limit), hidden: Math.max(0, all.length - limit) };
  }).filter((g) => g.models.length > 0);
}

/** What to show for the current value: its label if the list has it, else the raw custom ID, else the default. */
export function labelFor(models: readonly PickerModel[], value: string, defaultLabel: string): string {
  if (!value) return defaultLabel;
  return models.find((m) => m.value === value)?.label ?? value;
}
