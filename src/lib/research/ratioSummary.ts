import type { RatioOut } from '@/lib/dashboard/fundamentalsApi';

const KEY_RATIO = /p\/e|roce|roe|debt/i;

/** One line of the valuation and quality ratios worth showing next to a holding. */
export function summariseRatios(ratios: readonly RatioOut[] | null): string {
  return (ratios ?? [])
    .filter((r) => r.value !== null && KEY_RATIO.test(r.name))
    .map((r) => `${r.name} ${r.value}${r.unit ? ` ${r.unit}` : ''}`)
    .join('; ');
}
