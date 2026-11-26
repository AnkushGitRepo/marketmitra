// Three telecom companies for the head-to-head tests.
import type { CompareCompany } from './analysis';

const annual = (sales: number[]) => sales.map((s, i) => ({ periodEnd: `${2022 + i}-03-31`, sales: s, operatingProfit: Math.round(s / 3) }));

export const trio = (): CompareCompany[] => [
  { symbol: 'JPL', name: 'Jio Platforms', sector: 'Telecom', industry: 'Telecom Services', marketCap: 1_250_000, pe: 43.4, pb: 4.1, roce: 12.1, roe: 9.4, debtToEquity: 0.2, dividendYield: 0, salesCagr3y: 21.7, profitCagr3y: 24, annual: annual([90, 110, 135, 160, 190]) },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel', sector: 'Telecom', industry: 'Telecom Services', marketCap: 1_310_000, pe: 39.7, pb: 8, roce: 17.6, roe: 20.3, debtToEquity: 1.9, dividendYield: 0.5, salesCagr3y: 17, profitCagr3y: 30, annual: annual([116, 139, 150, 172, 200]) },
  { symbol: 'IDEA', name: 'Vodafone Idea', sector: 'Telecom', industry: 'Telecom Services', marketCap: 122_000, pe: null, pb: -1.5, roce: -1.7, roe: null, debtToEquity: -4.6, dividendYield: 0, salesCagr3y: 5, profitCagr3y: null, annual: annual([40, 42, 43, 43, 44]) },
];
