import type { Metadata } from 'next';
import { Manrope, JetBrains_Mono } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { isHosted } from '@/lib/deployment-mode';
import { CookieNotice } from '@/components/landing/CookieNotice';
import './globals.css';

const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://marketmitra-v2.vercel.app';
const DESCRIPTION =
  'Open-source, self-hostable financial dashboard for Indian markets — portfolio, alerts, news, IPOs, and AI-agent analysis. Free, no paid tier.';

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: { default: 'MarketMitra', template: '%s — MarketMitra' },
  description: DESCRIPTION,
  openGraph: {
    title: 'MarketMitra',
    description: DESCRIPTION,
    url: APP_URL,
    siteName: 'MarketMitra',
    images: [{ url: '/og-image.png', width: 1280, height: 640, alt: 'MarketMitra' }],
    locale: 'en_IN',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MarketMitra',
    description: DESCRIPTION,
    images: ['/og-image.png'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const hosted = isHosted();
  return (
    <html lang="en" className={`${manrope.variable} ${jetbrainsMono.variable}`}>
      <body>
        {hosted ? <ClerkProvider>{children}</ClerkProvider> : children}
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
