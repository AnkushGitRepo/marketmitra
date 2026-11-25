// The cards, charts and tables of each chapter, computed from stored data (#360). No model is involved.

import type { ResearchBlock } from '../blocks';
import { companyBlocks, companyKpis, peerMedianPe, peerTable } from '../companyBlocks';
import { buildCompanyData } from '../companyData';
import { toNumber } from '../formatters';
import type { ChapterId } from './chapters';
import { announcementBlocks, ownershipBlocks } from './governanceBlocks';
import type { ReportInputs } from './inputs';
import { statementBlocks } from './statementBlocks';
import { buildYearFigures, type YearFigures } from './statements';
import { valuationBlocks } from './valuationBlocks';
import { workingCapitalBlocks } from './workingCapitalBlocks';

export interface ComputedReport {
  readonly blocks: Readonly<Record<ChapterId, readonly ResearchBlock[]>>;
  readonly years: readonly YearFigures[];
  /** Current ratios by name (market cap in ₹ crore). */
  readonly ratios: Readonly<Record<string, number | null>>;
  /** Promoter pledge as Screener flags it, or null when it flags none (which is not a confirmed zero). */
  readonly pledge: number | null;
  /** Change in foreign institutional holding on the quarter before, in percentage points. */
  readonly fiiChange: number | null;
}

export function computeReport(inputs: ReportInputs): ComputedReport {
  const { company, peers } = inputs;
  const data = buildCompanyData({ symbol: inputs.symbol, name: company.name, ratios: inputs.ratios, profitAndLoss: inputs.profitAndLoss, shareholding: inputs.shareholding });
  const years = buildYearFigures({ profitAndLoss: inputs.profitAndLoss, balanceSheet: inputs.balanceSheet, cashFlow: inputs.cashFlow });
  const pledge = toNumber(inputs.ratios?.find((r) => r.name === 'Promoter Pledge %')?.value);
  const peerList = peers ?? [];
  const sales = companyBlocks(data, peerList).find((b) => b.type === 'financial_chart');

  return {
    years,
    ratios: data.ratios,
    pledge,
    fiiChange: data.fii.change,
    blocks: {
      overview: [companyKpis(data, peerList)],
      financials: [...(sales ? [sales] : []), ...statementBlocks(years), ...workingCapitalBlocks(inputs.ratiosHistory)],
      peers: peerTable(peerList) ? [peerTable(peerList) as ResearchBlock] : [],
      sector: [],
      regulatory: [],
      legal: announcementBlocks(inputs.announcements),
      management: ownershipBlocks(inputs.shareholding, pledge),
      valuation: valuationBlocks({ years, prices: inputs.prices, ratios: data.ratios, peerMedianPe: peerMedianPe(peerList) }),
      risks: [],
    },
  };
}
