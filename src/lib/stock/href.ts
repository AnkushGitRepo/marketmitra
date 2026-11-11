/** The stock page for a symbol. The page upper-cases it again, so the casing here only keeps URLs tidy. */
export function stockHref(symbol: string): string {
  return `/stock/${encodeURIComponent(symbol.trim().toUpperCase())}`;
}
