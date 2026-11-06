import { describe, expect, it } from 'vitest';
import { isPublicIp, safeHref, validateOutboundUrl } from './outbound';

describe('isPublicIp', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254', // cloud metadata
    '100.64.0.1', // CGNAT
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '::1',
    '::',
    'fe80::1',
    'fc00::1',
    'fd12:3456::1',
    '::ffff:127.0.0.1', // IPv4-mapped loopback
    '::ffff:10.0.0.1',
    '64:ff9b::7f00:1', // NAT64 embedding 127.0.0.1
    '2002:7f00:1::', // 6to4 embedding 127.0.0.1
    'ff02::1',
  ])('rejects the non-public address %s', (ip) => {
    expect(isPublicIp(ip)).toBe(false);
  });

  it.each(['8.8.8.8', '1.1.1.1', '151.101.1.1', '172.15.0.1', '172.32.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'])(
    'allows the public address %s',
    (ip) => {
      expect(isPublicIp(ip)).toBe(true);
    }
  );

  it('rejects things that are not IP literals', () => {
    expect(isPublicIp('example.com')).toBe(false);
    expect(isPublicIp('')).toBe(false);
  });
});

describe('validateOutboundUrl', () => {
  const hosted = { allowHttp: false, allowPrivate: false };

  it('accepts a normal https URL', () => {
    expect(validateOutboundUrl('https://hooks.example.com/abc', hosted).ok).toBe(true);
  });

  it('rejects non-http(s) schemes', () => {
    for (const u of ['ftp://x.com/a', 'file:///etc/passwd', 'javascript:alert(1)', 'gopher://x.com']) {
      expect(validateOutboundUrl(u, hosted).ok).toBe(false);
    }
  });

  it('rejects http when hosted but allows it for self-host', () => {
    expect(validateOutboundUrl('http://example.com/x', hosted).ok).toBe(false);
    expect(validateOutboundUrl('http://example.com/x', { allowHttp: true, allowPrivate: false }).ok).toBe(true);
  });

  it('rejects credentials in the URL', () => {
    expect(validateOutboundUrl('https://user:pass@example.com/', hosted).ok).toBe(false);
  });

  it('rejects IP-literal and local hosts when private targets are not allowed', () => {
    for (const u of [
      'https://127.0.0.1/x',
      'https://[::1]/x',
      'https://169.254.169.254/latest/meta-data',
      'https://localhost/x',
      'https://app.localhost/x',
      'https://service.internal/x',
      'https://printer.local/x',
      'https://10.0.0.5:8443/x',
      'https://0x7f000001/x', // hex IPv4 (URL parser normalises to 127.0.0.1)
      'https://2130706433/x', // decimal IPv4
    ]) {
      expect(validateOutboundUrl(u, hosted).ok, u).toBe(false);
    }
  });

  it('allows local targets only when explicitly permitted (self-host)', () => {
    expect(validateOutboundUrl('http://localhost:5678/hook', { allowHttp: true, allowPrivate: true }).ok).toBe(true);
  });

  it('rejects unusual ports on hosted deployments', () => {
    expect(validateOutboundUrl('https://example.com:6379/', hosted).ok).toBe(false);
    expect(validateOutboundUrl('https://example.com:8443/', hosted).ok).toBe(true);
  });

  it('enforces an exact host allowlist when given', () => {
    const slack = { ...hosted, allowedHosts: ['hooks.slack.com'] };
    expect(validateOutboundUrl('https://hooks.slack.com/services/T/B/x', slack).ok).toBe(true);
    expect(validateOutboundUrl('https://hooks.slack.com.evil.com/services', slack).ok).toBe(false);
    expect(validateOutboundUrl('https://evil.com/hooks.slack.com', slack).ok).toBe(false);
  });

  it('rejects absurdly long URLs and garbage', () => {
    expect(validateOutboundUrl('https://example.com/' + 'a'.repeat(3000), hosted).ok).toBe(false);
    expect(validateOutboundUrl('not a url', hosted).ok).toBe(false);
  });
});

describe('safeHref', () => {
  it('passes http(s) links through', () => {
    expect(safeHref('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(safeHref('http://example.com')).toBe('http://example.com');
  });
  it('neutralises script and data URLs and junk', () => {
    expect(safeHref('javascript:alert(1)')).toBe('#');
    expect(safeHref('JaVaScRiPt:alert(1)')).toBe('#');
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBe('#');
    expect(safeHref('vbscript:x')).toBe('#');
    expect(safeHref('')).toBe('#');
    expect(safeHref(null)).toBe('#');
    expect(safeHref(undefined)).toBe('#');
  });
});
