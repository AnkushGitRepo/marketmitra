import { ImageResponse } from 'next/og';
import { getCompany } from '@/lib/dashboard/fundamentalsApi';

export const alt = 'MarketMitra stock page';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const symbol = ticker.toUpperCase();
  const company = await getCompany(symbol);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          background: '#fbfaf8',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            color: '#8a9099',
            textTransform: 'uppercase',
            marginBottom: 28,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 13,
              background: '#15171c',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="22" height="22" viewBox="0 0 28 28">
              <path
                d="M7 18.6 L12 13.2 L15.6 15.8 L21 9.4"
                fill="none"
                stroke="#7ee2a8"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="21" cy="9.4" r="3" fill="#7ee2a8" />
            </svg>
          </div>
          MarketMitra
        </div>
        <div style={{ display: 'flex', fontSize: 72, fontWeight: 800, color: '#15171c', letterSpacing: '-0.03em' }}>
          {company?.name ?? symbol}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 24 }}>
          <div
            style={{
              display: 'flex',
              padding: '10px 22px',
              borderRadius: 999,
              background: '#15171c',
              color: '#fbf8f1',
              fontSize: 28,
              fontWeight: 700,
              fontFamily: 'monospace',
            }}
          >
            {symbol}
          </div>
          {company?.sector && (
            <div style={{ display: 'flex', fontSize: 28, color: '#6b747c' }}>{company.sector}</div>
          )}
        </div>
      </div>
    ),
    { ...size }
  );
}
