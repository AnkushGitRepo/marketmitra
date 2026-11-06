import { describe, expect, it } from 'vitest';
import { resolveInternalOrigin } from './internalOrigin';

describe('resolveInternalOrigin', () => {
  const evil = 'https://evil.example/api/agents/run';

  it('prefers the configured public app URL and ignores the request Host', () => {
    expect(resolveInternalOrigin({ NEXT_PUBLIC_APP_URL: 'https://app.example.com/', NODE_ENV: 'production' }, evil)).toBe(
      'https://app.example.com'
    );
  });
  it('falls back to Vercel\'s platform-set production URL', () => {
    expect(resolveInternalOrigin({ VERCEL_PROJECT_PRODUCTION_URL: 'mm.vercel.app', NODE_ENV: 'production' }, evil)).toBe(
      'https://mm.vercel.app'
    );
  });
  it('uses loopback for self-hosted production instead of trusting Host', () => {
    expect(resolveInternalOrigin({ NODE_ENV: 'production', PORT: '4000' }, evil)).toBe('http://127.0.0.1:4000');
    expect(resolveInternalOrigin({ NODE_ENV: 'production' }, evil)).toBe('http://127.0.0.1:3000');
  });
  it('uses the request origin only in development', () => {
    expect(resolveInternalOrigin({ NODE_ENV: 'development' }, 'http://localhost:3000/api/agents/run')).toBe(
      'http://localhost:3000'
    );
  });
});
