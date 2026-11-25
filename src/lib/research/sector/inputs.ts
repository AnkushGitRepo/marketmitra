import type { ScreenerResultRow } from '@/lib/dashboard/screenerSchema';
import type { ThemeKind } from '../themeSearch';

/** What the data service holds about one theme's listed companies. */
export interface SectorInputs {
  /** The theme, sector or industry as it will be titled ("Defence & Aerospace"). */
  readonly label: string;
  readonly kind: ThemeKind;
  /** The data service's industry and sector names it covers. */
  readonly industries: readonly string[];
  readonly sectors: readonly string[];
  /** Listed companies in the theme. */
  readonly count: number;
  /** The largest by market cap that were fetched, biggest first, each symbol once. */
  readonly rows: readonly ScreenerResultRow[];
}
