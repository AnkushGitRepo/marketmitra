import type { Metadata } from 'next';
import { IndexCard } from '@/components/dashboard-charts/IndexCard';
import { WishlistPanel } from '@/components/dashboard-charts/WishlistPanel';
import { getCurrentUserId } from '@/lib/currentUserId';
import { getIndices } from '@/lib/dashboard/fundamentalsApi';
import { getQuotes, type Quote } from '@/lib/dashboard/quotes';
import { listWishlists, type UserWishlist } from '@/lib/wishlists/userWishlists';
import { MarketsSearchBar } from './MarketsSearchBar';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Markets',
  description: 'Live Indian market indices and your own stock wishlists.',
};

export const dynamic = 'force-dynamic';

export default async function MarketsPage() {
  const userId = await getCurrentUserId();

  let wishlists: UserWishlist[] = [];
  if (userId) {
    try {
      wishlists = await listWishlists(userId);
    } catch {
      // Mongo unreachable — render the shell with no wishlists rather than 500.
    }
  }

  const allSymbols = Array.from(new Set(wishlists.flatMap((w) => w.symbols)));
  const [indices, quoteList] = await Promise.all([
    getIndices(),
    allSymbols.length > 0 ? getQuotes(allSymbols) : Promise.resolve<Quote[]>([]),
  ]);
  const quotes = Object.fromEntries(quoteList.map((q) => [q.symbol, q]));

  return (
    <div className={styles.pageRoot}>
      <div className={styles.head}>
        <p className={styles.eyebrow}>Live market data</p>
        <h1 className={styles.h1}>Markets</h1>
        <MarketsSearchBar />
      </div>

      <div className={styles.indexGrid}>
        {(indices ?? []).map((ix) => (
          <IndexCard key={ix.name} index={ix} />
        ))}
        {(!indices || indices.length === 0) && (
          <p className={styles.eyebrow}>Index data is temporarily unavailable — the fundamentals service may be offline.</p>
        )}
      </div>

      {userId ? (
        <WishlistPanel wishlists={wishlists} quotes={quotes} />
      ) : (
        <p className={styles.eyebrow}>Sign in to build your own stock wishlists.</p>
      )}
    </div>
  );
}
