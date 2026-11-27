// The precious-metals view (ADR 0086): Indian parity prices for gold, silver and platinum, the gold/silver ratio, and
// the NSE gold and silver ETFs. `buildCommodities` is pure; `getCommodities` fetches (server only) and caches.

import {
  GOLD_22K_RATIO,
  GST_PCT,
  IMPORT_DUTY_EFFECTIVE_FROM,
  IMPORT_DUTY_PCT,
  UNITS,
  goldSilverRatio,
  parityPrice,
  type MetalId,
} from './convert';

export interface RawQuote {
  readonly price: number | null;
  readonly changePct: number | null;
  readonly week52High: number | null;
  readonly week52Low: number | null;
  readonly asOf: string | null;
}

export interface MetalRate {
  readonly id: string;
  readonly label: string;
  readonly unit: string;
  readonly priceInr: number | null;
  /** The futures contract's own day change; the rupee rate's move is not included. */
  readonly changePct: number | null;
  readonly week52HighInr: number | null;
  readonly week52LowInr: number | null;
  /** Always true: these are computed from international prices, not an official Indian rate. */
  readonly estimate: true;
  readonly note: string;
}

export interface EtfRow {
  readonly symbol: string;
  readonly name: string;
  readonly metal: 'gold' | 'silver';
  readonly price: number | null;
  readonly changePct: number | null;
  readonly week52High: number | null;
  readonly week52Low: number | null;
}

export interface CommoditiesData {
  readonly metals: readonly MetalRate[];
  readonly goldSilverRatio: number | null;
  readonly etfs: readonly EtfRow[];
  readonly assumptions: { readonly usdInr: number | null; readonly importDutyPct: number; readonly dutyEffectiveFrom: string; readonly gstPct: number };
  readonly asOf: string | null;
}

/** The NSE gold and silver ETFs worth listing. SETFGOLD returned no data from Yahoo and is left out. */
export const METAL_ETFS: readonly { readonly symbol: string; readonly name: string; readonly metal: 'gold' | 'silver' }[] = [
  { symbol: 'GOLDBEES', name: 'Nippon India ETF Gold BeES', metal: 'gold' },
  { symbol: 'GOLDIETF', name: 'ICICI Prudential Gold ETF', metal: 'gold' },
  { symbol: 'HDFCGOLD', name: 'HDFC Gold ETF', metal: 'gold' },
  { symbol: 'SILVERBEES', name: 'Nippon India Silver ETF', metal: 'silver' },
  { symbol: 'SILVERIETF', name: 'ICICI Prudential Silver ETF', metal: 'silver' },
  { symbol: 'HDFCSILVER', name: 'HDFC Silver ETF', metal: 'silver' },
  { symbol: 'SBISILVER', name: 'SBI Silver ETF', metal: 'silver' },
  { symbol: 'TATSILV', name: 'Tata Silver ETF', metal: 'silver' },
];

export const FUTURES: Readonly<Record<MetalId, string>> = { gold: 'GC=F', silver: 'SI=F', platinum: 'PL=F' };
export const USDINR_TICKER = 'USDINR=X';

export interface RawInputs {
  readonly futures: Readonly<Record<MetalId, RawQuote | null>>;
  readonly usdInr: RawQuote | null;
  readonly etfs: Readonly<Record<string, RawQuote | null>>;
}

const GOLD_NOTE = 'An estimate that tracks the Indian benchmark rate: the international price converted to rupees with the 15% import duty. Excludes GST, making charges and local premium.';
const OTHER_NOTE = 'International price converted to rupees with the import duty. The Indian rate is usually higher because of local premium.';

export function buildCommodities(raw: RawInputs): CommoditiesData {
  const fx = raw.usdInr?.price ?? null;
  const rate = (id: string, label: string, metal: MetalId, ratio: number, note: string): MetalRate => {
    const q = raw.futures[metal];
    const conv = (usd: number | null) => {
      const p = parityPrice(metal, usd, fx);
      return p === null ? null : p * ratio;
    };
    return {
      id,
      label,
      unit: UNITS[metal].label,
      priceInr: conv(q?.price ?? null),
      changePct: q?.changePct ?? null,
      week52HighInr: conv(q?.week52High ?? null),
      week52LowInr: conv(q?.week52Low ?? null),
      estimate: true,
      note,
    };
  };

  const metals = [
    rate('gold-24k', 'Gold 24K (999)', 'gold', 1, GOLD_NOTE),
    rate('gold-22k', 'Gold 22K (916)', 'gold', GOLD_22K_RATIO, `${GOLD_NOTE} 22K is 916/999 of the 24K figure, not a separate market quote.`),
    rate('silver-999', 'Silver (999)', 'silver', 1, OTHER_NOTE),
    rate('platinum-999', 'Platinum (999)', 'platinum', 1, OTHER_NOTE),
  ];

  const gold = metals[0].priceInr;
  const silver = metals[2].priceInr;
  const times = [...Object.values(raw.futures), raw.usdInr].flatMap((q) => (q?.asOf ? [q.asOf] : [])).sort();

  return {
    metals,
    goldSilverRatio: goldSilverRatio(gold, silver),
    etfs: METAL_ETFS.map((e) => {
      const q = raw.etfs[e.symbol] ?? null;
      return { ...e, price: q?.price ?? null, changePct: q?.changePct ?? null, week52High: q?.week52High ?? null, week52Low: q?.week52Low ?? null };
    }),
    assumptions: { usdInr: fx, importDutyPct: IMPORT_DUTY_PCT, dutyEffectiveFrom: IMPORT_DUTY_EFFECTIVE_FROM, gstPct: GST_PCT },
    asOf: times.length ? times[0] : null,
  };
}
