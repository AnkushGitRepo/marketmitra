import type { CommoditiesData } from '@/lib/commodities/rates';
import { valueOfWeight } from '@/lib/commodities/view';
import { entryLabel, priceRowId, type BullionEntry } from './schema';

export interface PricedEntry {
  readonly entry: BullionEntry;
  readonly label: string;
  /** Estimated value in rupees, or null when the price is unavailable (never zero). */
  readonly value: number | null;
  readonly cost: number | null;
  /** Value minus cost, only when the user gave a buy price and a price exists. */
  readonly gain: number | null;
  readonly gainPct: number | null;
}

export interface BullionSummary {
  readonly rows: readonly PricedEntry[];
  /** Sum of the values that could be priced. */
  readonly totalValue: number;
  /** How many entries had no price, so the total is understated. */
  readonly unpriced: number;
  /** Cost and gain across only the entries that have both a buy price and a price. */
  readonly trackedCost: number;
  readonly trackedGain: number;
}

/** Values every entry at the estimated Indian price. Pure: the prices come in as data. */
export function valueBullion(entries: readonly BullionEntry[], data: CommoditiesData | null): BullionSummary {
  const byId = new Map((data?.metals ?? []).map((m) => [m.id, m]));
  const rows: PricedEntry[] = entries.map((entry) => {
    const row = byId.get(priceRowId(entry));
    const value = row ? valueOfWeight(row, entry.grams) : null;
    const cost = entry.buyPricePerGram === null ? null : entry.buyPricePerGram * entry.grams;
    const gain = value !== null && cost !== null ? value - cost : null;
    return { entry, label: entryLabel(entry), value, cost, gain, gainPct: gain !== null && cost ? (gain / cost) * 100 : null };
  });
  const tracked = rows.filter((r) => r.gain !== null && r.cost !== null);
  return {
    rows,
    totalValue: rows.reduce((s, r) => s + (r.value ?? 0), 0),
    unpriced: rows.filter((r) => r.value === null).length,
    trackedCost: tracked.reduce((s, r) => s + (r.cost ?? 0), 0),
    trackedGain: tracked.reduce((s, r) => s + (r.gain ?? 0), 0),
  };
}
