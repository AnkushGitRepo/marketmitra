import { describe, expect, it } from 'vitest';
import { isCrossSiteWrite } from './csrf';

const base = { method: 'POST', origin: null as string | null, host: 'app.example.com', secFetchSite: null as string | null };

describe('isCrossSiteWrite', () => {
  it('never blocks safe methods', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      expect(isCrossSiteWrite({ ...base, method, origin: 'https://evil.com' })).toBe(false);
    }
  });

  it('allows same-origin browser writes', () => {
    expect(isCrossSiteWrite({ ...base, origin: 'https://app.example.com', secFetchSite: 'same-origin' })).toBe(false);
    expect(isCrossSiteWrite({ ...base, origin: 'https://app.example.com' })).toBe(false);
  });

  it('blocks writes whose Origin is another site', () => {
    expect(isCrossSiteWrite({ ...base, origin: 'https://evil.com' })).toBe(true);
    expect(isCrossSiteWrite({ ...base, origin: 'https://app.example.com.evil.com' })).toBe(true);
    expect(isCrossSiteWrite({ ...base, origin: 'null' })).toBe(true); // sandboxed iframe / data: URL
  });

  it('blocks writes the browser itself labels cross-site', () => {
    expect(isCrossSiteWrite({ ...base, secFetchSite: 'cross-site' })).toBe(true);
    expect(isCrossSiteWrite({ ...base, secFetchSite: 'same-site' })).toBe(true); // sibling subdomain
  });

  it('allows non-browser clients that send neither header (curl, cron, SDKs)', () => {
    expect(isCrossSiteWrite(base)).toBe(false);
  });

  it('treats an unparseable Origin as hostile', () => {
    expect(isCrossSiteWrite({ ...base, origin: 'not a url' })).toBe(true);
  });

  it('matches host including port', () => {
    expect(isCrossSiteWrite({ ...base, host: 'localhost:3000', origin: 'http://localhost:3000' })).toBe(false);
    expect(isCrossSiteWrite({ ...base, host: 'localhost:3000', origin: 'http://localhost:4000' })).toBe(true);
  });
});
