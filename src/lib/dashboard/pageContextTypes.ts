// Shared shape for "what page/state is the user looking at right now" —
// published by individual pages (e.g. the stock detail page) via
// PageContext.tsx and read by the Mitra chat route so the model can
// accurately reference "this stock"/"what you're looking at" (see ADR 0022).
// Kept dependency-free (no React import) so server-side code can import the
// type without pulling in a client component.

export interface PageContextValue {
  page: 'dashboard' | 'portfolio' | 'markets' | 'stock' | 'index';
  ticker?: string;
  /** Index display name (e.g. "NIFTY 50") when page === 'index'. */
  name?: string;
  range?: string;
}
