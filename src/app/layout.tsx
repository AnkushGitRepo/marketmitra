import type { Metadata, Viewport } from 'next';
import { Manrope, JetBrains_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { isHosted } from '@/lib/deployment-mode';
import { CookieNotice } from '@/components/landing/CookieNotice';
import './globals.css';

// Both are variable fonts: omitting `weight` ships one file covering every
// weight instead of one file per weight.
const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin'],
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
  // Mono is only used for small labels — don't preload it ahead of the hero.
  preload: false,
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://marketmitra-v2.vercel.app';
const DESCRIPTION =
  'Free, open-source Indian stock market dashboard: NSE and BSE stock pages, portfolio tracker, price alerts, market news, IPO tracker, stock screener and AI analysis with your own key. Self-hostable, no paid tier.';
const DEFAULT_TITLE = 'MarketMitra — Indian stock market dashboard, portfolio tracker and screener';

// Structured data for search engines: what the product is, stated plainly (no ratings, counts or claims we cannot back up).
const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'MarketMitra',
  description: DESCRIPTION,
  url: APP_URL,
  applicationCategory: 'FinanceApplication',
  operatingSystem: 'Web',
  isAccessibleForFree: true,
  license: 'https://opensource.org/licenses/MIT',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
  sameAs: ['https://github.com/AnkushGitRepo/marketmitra'],
};

// viewport-fit=cover lets the mobile bottom bar and sheet use env(safe-area-inset-bottom) on notched phones.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: { default: DEFAULT_TITLE, template: '%s — MarketMitra' },
  description: DESCRIPTION,
  keywords: ['Indian stock market', 'NSE', 'BSE', 'Nifty', 'Sensex', 'portfolio tracker', 'stock screener', 'IPO tracker', 'stock alerts', 'market news', 'open source', 'self-hosted'],
  alternates: { canonical: '/' },
  openGraph: {
    title: DEFAULT_TITLE,
    description: DESCRIPTION,
    url: APP_URL,
    siteName: 'MarketMitra',
    images: [{ url: '/og-image.png', width: 1280, height: 640, alt: 'MarketMitra' }],
    locale: 'en_IN',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: DEFAULT_TITLE,
    description: DESCRIPTION,
    images: ['/og-image.png'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const hosted = isHosted();
  return (
    <html lang="en" className={`${manrope.variable} ${jetbrainsMono.variable}`}>
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }} />
        {children}
        {/* Hosted-only (ADR 0023) — cookieless analytics + its disclosure
            notice, plus Speed Insights (same phone-home profile as
            Analytics). Self-host phones home to nothing by default. */}
        {hosted && <Analytics />}
        {hosted && <SpeedInsights />}
        {hosted && <CookieNotice />}
      </body>
    </html>
  );
}
