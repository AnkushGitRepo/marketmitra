// A read-only Mitra tool for Indian gold, silver and platinum prices (#452, ADR 0086). The prices are estimates from
// international prices, the rupee rate and India's import duty, and the tool says so in every answer. It holds no user
// data and writes nothing; a weight the user states in chat can be valued, but nothing is stored.

import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import { getCommodities } from '@/lib/commodities/getCommodities';
import type { CommoditiesData, MetalRate } from '@/lib/commodities/rates';
import { shownPrice, valueOfWeight } from '@/lib/commodities/view';

export const COMMODITY_TOOL = 'get_commodity_prices';

export interface CommodityDeps {
  readonly commodities: () => Promise<CommoditiesData>;
}

const LIVE: CommodityDeps = { commodities: () => getCommodities() };

const MAX_GRAMS = 1_000_000;
const METALS = ['gold', 'silver', 'platinum'] as const;
const PURITIES = ['24k', '22k'] as const;

const round = (n: number | null): number | null => (n === null ? null : Math.round(n));

function view(m: MetalRate, gstPct: number) {
  return {
    id: m.id,
    label: m.label,
    unit: m.unit,
    priceInr: round(m.priceInr),
    priceInclGstInr: round(shownPrice(m.priceInr, true)),
    gstPct,
    futuresChangeTodayPct: m.changePct === null ? null : Number(m.changePct.toFixed(2)),
    week52LowInr: round(m.week52LowInr),
    week52HighInr: round(m.week52HighInr),
  };
}

/** Which of the metal rows answers the question: gold by purity (24K unless 22K is asked for), silver and platinum as listed. */
function rowFor(data: CommoditiesData, metal: (typeof METALS)[number], purity: (typeof PURITIES)[number]): MetalRate | undefined {
  const id = metal === 'gold' ? (purity === '22k' ? 'gold-22k' : 'gold-24k') : metal === 'silver' ? 'silver-999' : 'platinum-999';
  return data.metals.find((m) => m.id === id);
}

export function buildCommodityTools(deps: CommodityDeps = LIVE): ToolSet {
  return {
    [COMMODITY_TOOL]: tool({
      description:
        "Indian gold (24K and 22K, per 10 g), silver (999, per kg) and platinum (999, per gram) prices, with today's change, the 52-week range and the gold-to-silver ratio; optionally what a weight of one metal is worth. These are ESTIMATES: the international price converted to rupees plus India's import duty, not the official IBJA or MCX rate, and they exclude GST, making charges and local premium. Gold tracks the Indian benchmark closely; silver and platinum usually run lower than the Indian rate. Always say they are estimates. Pass metal and grams to value a weight the user states (for example 50 g of 24K gold). Nothing is saved. Read-only. Describe the numbers; do not tell the user to buy or sell.",
      inputSchema: z.object({
        metal: z.enum(METALS).optional().describe('Only this metal. Omit for all.'),
        grams: z.number().positive().max(MAX_GRAMS).optional().describe('A weight in grams to value. Needs metal. Use only a weight the user gave.'),
        purity: z.enum(PURITIES).optional().describe('Gold only: 24k (default) or 22k.'),
      }),
      execute: async ({ metal, grams, purity }) => {
        try {
          const data = await deps.commodities();
          if (data.metals.every((m) => m.priceInr === null)) return { available: false, error: 'prices unavailable right now' };
          const wanted = metal ? data.metals.filter((m) => m.id.startsWith(metal)) : data.metals;
          const out: Record<string, unknown> = {
            available: true,
            estimate: true,
            basis: `International price in rupees with India's ${data.assumptions.importDutyPct}% import duty (in force since ${data.assumptions.dutyEffectiveFrom}, last confirmed ${data.assumptions.dutyCheckedOn}). Not the IBJA or MCX rate.`,
            ...(data.assumptions.dutyStale ? { warning: 'The duty has not been confirmed for over 45 days; figures may be off if it changed.' } : {}),
            asOf: data.asOf,
            metals: wanted.map((m) => view(m, data.assumptions.gstPct)),
            goldSilverRatio: data.goldSilverRatio === null ? null : Number(data.goldSilverRatio.toFixed(1)),
          };
          if (grams !== undefined) {
            const row = metal ? rowFor(data, metal, purity ?? '24k') : undefined;
            const value = row ? valueOfWeight(row, grams) : null;
            out.valuation = row && value !== null
              ? { metal: row.label, grams, estimatedValueInr: Math.round(value), estimatedValueInclGstInr: Math.round(shownPrice(value, true) ?? value), note: 'An estimate of the metal value at the price above; a jeweller or bank will quote differently (making charges, local premium, purity testing).' }
              : { error: metal ? 'could not price that weight' : 'say which metal the weight is' };
          }
          return out;
        } catch (e) {
          return { available: false, error: e instanceof Error ? e.message : 'unavailable' };
        }
      },
    }),
  };
}
