// Client for services/fundamentals-api's GET /ipos (ADR 0017). GMP fields
// are an unofficial grey-market estimate — surface them with that caveat.
// Returns [] on failure; callers render an honest empty state.

const BASE_URL = process.env.FUNDAMENTALS_API_URL ?? 'http://localhost:8420';

export type IpoStatus = 'upcoming' | 'open' | 'closed' | 'listed';
export type IpoCategory = 'mainboard' | 'sme';

export interface Ipo {
  slug: string;
  name: string;
  source_url: string | null;
  category: IpoCategory;
  status: IpoStatus;
  price: number | null;
  ipo_size_cr: number | null;
  lot_size: number | null;
  rating: number | null;
  subscription_times: number | null;
  /** Category-wise subscription multiples from the latest bidding day (#285); absent or null when unknown. */
  sub_qib?: number | null;
  sub_nii?: number | null;
  sub_snii?: number | null;
  sub_bnii?: number | null;
  sub_retail?: number | null;
  /** When those figures were read (ISO). */
  sub_as_of?: string | null;
  anchor: boolean | null;
  gmp: number | null;
  gmp_pct: number | null;
  gmp_low: number | null;
  gmp_high: number | null;
  gmp_updated_at: string | null;
  open_date: string | null;
  close_date: string | null;
  allotment_date: string | null;
  listing_date: string | null;
  source_tier: string;
  fetched_at: string;
}

export async function getIpos(status?: IpoStatus): Promise<Ipo[]> {
  const qs = status ? `?status=${status}` : '';
  try {
    const response = await fetch(`${BASE_URL}/ipos${qs}`, { next: { revalidate: 600 } });
    if (!response.ok) return [];
    return (await response.json()) as Ipo[];
  } catch {
    return [];
  }
}
