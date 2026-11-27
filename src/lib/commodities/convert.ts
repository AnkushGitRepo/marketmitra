// Indian parity prices for precious metals (ADR 0086): the international futures price, in rupees, with the import
// duty on top. Pure and dated: the duty is a constant that must be edited when the Budget changes it.

export type MetalId = 'gold' | 'silver' | 'platinum';

/** Grams in one troy ounce, the unit the futures are quoted in. */
export const GRAMS_PER_TROY_OZ = 31.1035;

/** India's import duty on gold, silver and platinum: 10% basic duty plus 5% AIDC from 13 May 2026 (Customs Notification
 * 16/2026), up from about 6%. From news reports, not the CBIC site: the maintainer should confirm it. */
export const IMPORT_DUTY_PCT = 15;
export const IMPORT_DUTY_EFFECTIVE_FROM = '2026-05-13';

/** GST on a retail purchase of gold, silver or platinum. Not part of the benchmark rate; offered as a toggle. */
export const GST_PCT = 3;

/** 22K gold (916) as a share of 24K (999). A purity ratio, not a market quote. */
export const GOLD_22K_RATIO = 916 / 999;

interface UnitSpec {
  readonly label: string;
  /** Grams the quoted price is for. */
  readonly grams: number;
}

/** The unit Indian buyers quote each metal in. */
export const UNITS: Readonly<Record<MetalId, UnitSpec>> = {
  gold: { label: '10 g', grams: 10 },
  silver: { label: '1 kg', grams: 1000 },
  platinum: { label: '1 g', grams: 1 },
};

/** Futures price (US dollars per troy ounce) to rupees for the metal's Indian unit, with import duty. Null if an input is unusable. */
export function parityPrice(metal: MetalId, usdPerOz: number | null, usdInr: number | null, dutyPct: number = IMPORT_DUTY_PCT): number | null {
  if (usdPerOz === null || usdInr === null || !(usdPerOz > 0) || !(usdInr > 0)) return null;
  const perGram = (usdPerOz * usdInr) / GRAMS_PER_TROY_OZ;
  return perGram * UNITS[metal].grams * (1 + dutyPct / 100);
}

export const withGst = (price: number, gstPct: number = GST_PCT): number => price * (1 + gstPct / 100);

/** Gold per kilogram over silver per kilogram: how many kilograms of silver one kilogram of gold is worth. */
export function goldSilverRatio(goldPer10g: number | null, silverPerKg: number | null): number | null {
  if (goldPer10g === null || silverPerKg === null || !(silverPerKg > 0)) return null;
  return (goldPer10g * 100) / silverPerKg;
}
