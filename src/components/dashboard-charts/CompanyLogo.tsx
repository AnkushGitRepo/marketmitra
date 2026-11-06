'use client';

import { useState } from 'react';

// Real company logos from api.dharun.dev (no key, 600 req/min/client), which
// serves the community-maintained indian-listed-company-logos dataset. A bare
// ticker prefers NSE. Unknown symbols 404 (we deliberately don't pass
// fallback=monogram), so this falls back to our own initials on load failure
// rather than showing a broken image.
const LOGO_URL = (symbol: string) =>
  `https://api.dharun.dev/v1/logos/${encodeURIComponent(symbol)}`;

export function CompanyLogo({ symbol, size }: { symbol: string; size: number }) {
  const [errored, setErrored] = useState(false);

  if (errored) {
    return <>{symbol.slice(0, 3)}</>;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- external SVG logo, arbitrary host, needs onError fallback
    <img
      src={LOGO_URL(symbol)}
      alt={`${symbol} logo`}
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: 'contain' }}
      onError={() => setErrored(true)}
    />
  );
}
