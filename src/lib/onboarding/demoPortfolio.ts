import type { HoldingLike } from '@/lib/portfolio/portfolioMetrics';

// A made-up sample so a new user can see the portfolio views without entering anything (ADR 0075). Prices are
// illustrative, not live quotes, and the demo page says so. Nothing here is ever written to a user's account.
export const DEMO_HOLDINGS: readonly HoldingLike[] = [
  { symbol: 'RELIANCE', name: 'Reliance Industries', quantity: 20, avgPrice: 1280, ltp: 1420, sector: 'Energy', dayChange: null },
  { symbol: 'HDFCBANK', name: 'HDFC Bank', quantity: 40, avgPrice: 1510, ltp: 1690, sector: 'Financial Services', dayChange: null },
  { symbol: 'ICICIBANK', name: 'ICICI Bank', quantity: 50, avgPrice: 1190, ltp: 1325, sector: 'Financial Services', dayChange: null },
  { symbol: 'TCS', name: 'Tata Consultancy Services', quantity: 10, avgPrice: 3900, ltp: 3650, sector: 'Information Technology', dayChange: null },
  { symbol: 'NIFTYBEES', name: 'Nippon India Nifty 50 BeES', quantity: 150, avgPrice: 250, ltp: 275, sector: 'Index fund', dayChange: null },
];
