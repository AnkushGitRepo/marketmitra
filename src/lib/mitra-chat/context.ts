import { isHosted } from '@/lib/deployment-mode';
import { getEnrichedHoldings } from '@/lib/dashboard/enrichedHoldings';
import type { HoldingLike } from '@/lib/portfolio/portfolioMetrics';

export interface ChatContext {
  /** The user's first name when known (hosted accounts only); null otherwise. */
  readonly firstName: string | null;
  /** What the empty state needs to personalise itself: the user's own holdings with live prices. */
  readonly holdings: readonly HoldingLike[];
}

async function lookupFirstName(): Promise<string | null> {
  if (!isHosted()) return null;
  try {
    const { currentUser } = await import('@clerk/nextjs/server');
    const user = await currentUser();
    return user?.firstName || user?.username || null;
  } catch {
    return null;
  }
}

/** Holdings and first name for the Mitra empty state. Never throws: missing data just means a less personal greeting. */
export async function getChatContext(userId: string): Promise<ChatContext> {
  const [firstName, holdings] = await Promise.all([lookupFirstName(), getEnrichedHoldings(userId).catch(() => [])]);
  return {
    firstName,
    holdings: holdings.map((h) => ({
      symbol: h.symbol,
      name: h.name,
      quantity: h.quantity,
      avgPrice: h.avgPrice,
      ltp: h.ltp,
      sector: h.sector,
      dayChange: h.dayChange,
    })),
  };
}
