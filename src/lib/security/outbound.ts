import { lookup as dnsLookup } from 'node:dns';
import { isIP, type LookupFunction } from 'node:net';
import { Agent, fetch as undiciFetch } from 'undici';

/** SSRF defences for every request the server makes to a URL a *user* supplied
 * (alert webhooks, etc.). Three layers: a static URL check when the URL is
 * saved, the same check again at send time, and — the part that defeats DNS
 * rebinding — a guard on the actual socket connection that refuses non-public
 * addresses no matter what a hostname resolved to a moment earlier. */

// Client-safe; lives in its own module so browser bundles don't pull in node:dns.
export { safeHref } from './safeHref';

const MAX_URL_LENGTH = 2048;

/** A URL we refuse to call. Its message is safe to show to the user. */
export class OutboundBlockedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'OutboundBlockedError';
  }
}

export type OutboundCheck = { ok: true; url: URL } | { ok: false; reason: string };

export interface OutboundOptions {
  /** Allow plain http (self-host only). */
  allowHttp: boolean;
  /** Allow loopback/private targets such as http://localhost:5678 (self-host only). */
  allowPrivate: boolean;
  /** If set, the hostname must equal one of these exactly. */
  allowedHosts?: readonly string[];
}

function ipv4Parts(ip: string): number[] | null {
  const parts = ip.split('.').map(Number);
  return parts.length === 4 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) ? parts : null;
}

function isPublicIpv4(ip: string): boolean {
  const p = ipv4Parts(ip);
  if (!p) return false;
  const [a, b, c] = p;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  if (a === 169 && b === 254) return false; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && c === 0) return false;
  if (a === 192 && b === 0 && c === 2) return false;
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  if (a >= 224) return false; // multicast, reserved, broadcast
  return true;
}

/** Expands an IPv6 literal to 8 hextets (handles `::` and a dotted IPv4 tail). */
function parseIpv6(ip: string): number[] | null {
  let s = ip.split('%')[0].toLowerCase();
  const tail = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (tail) {
    const v4 = ipv4Parts(tail[1]);
    if (!v4) return null;
    s = s.slice(0, -tail[1].length) + ((v4[0] << 8) | v4[1]).toString(16) + ':' + ((v4[2] << 8) | v4[3]).toString(16);
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 0) return null;
  const groups = halves.length === 1 ? head : [...head, ...Array(missing).fill('0'), ...rest];
  const nums = groups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return nums.some(Number.isNaN) ? null : nums;
}

function isPublicIpv6(ip: string): boolean {
  const g = parseIpv6(ip);
  if (!g) return false;
  const embedded = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  if (g.every((x) => x === 0)) return false; // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return false; // ::1
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return isPublicIpv4(embedded(g[6], g[7])); // ::ffff:a.b.c.d
  if (g[0] === 0x64 && g[1] === 0xff9b) return isPublicIpv4(embedded(g[6], g[7])); // NAT64
  if (g[0] === 0x2002) return isPublicIpv4(embedded(g[1], g[2])); // 6to4
  if ((g[0] & 0xfe00) === 0xfc00) return false; // unique local fc00::/7
  if ((g[0] & 0xffc0) === 0xfe80) return false; // link-local fe80::/10
  if ((g[0] & 0xff00) === 0xff00) return false; // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false; // documentation
  return true;
}

/** True only for a globally routable IP literal. Hostnames return false. */
export function isPublicIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isPublicIpv4(ip);
  if (kind === 6) return isPublicIpv6(ip);
  return false;
}

const LOCAL_SUFFIXES = ['.localhost', '.local', '.internal', '.localdomain', '.lan', '.home.arpa', '.intranet'];

/** Static checks on a user-supplied outbound URL (no network). */
export function validateOutboundUrl(raw: string, opts: OutboundOptions): OutboundCheck {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_URL_LENGTH) {
    return { ok: false, reason: 'URL is missing or too long' };
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'URL is not valid' };
  }
  if (url.protocol !== 'https:' && !(opts.allowHttp && url.protocol === 'http:')) {
    return { ok: false, reason: opts.allowHttp ? 'URL must be http(s)' : 'URL must use https' };
  }
  if (url.username || url.password) return { ok: false, reason: 'URL must not contain credentials' };

  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (opts.allowedHosts && !opts.allowedHosts.includes(host)) {
    return { ok: false, reason: `Host must be ${opts.allowedHosts.join(' or ')}` };
  }

  if (!opts.allowPrivate) {
    if (isIP(host)) {
      if (!isPublicIp(host)) return { ok: false, reason: 'URL must not point at a private or local address' };
    } else if (host === 'localhost' || !host.includes('.') || LOCAL_SUFFIXES.some((s) => host.endsWith(s))) {
      return { ok: false, reason: 'URL must not point at a private or local host' };
    }
    const allowedPorts = new Set(['', '443', '8443', ...(opts.allowHttp ? ['80', '8080'] : [])]);
    if (!allowedPorts.has(url.port)) return { ok: false, reason: 'URL uses a port that is not allowed' };
  }
  return { ok: true, url };
}

/** DNS lookup that refuses non-public results at connection time — closes the
 * check-then-connect gap that DNS rebinding relies on. */
function guardedLookup(allowPrivate: boolean): LookupFunction {
  return (hostname, options, callback) => {
    dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err, '', 0);
      if (!allowPrivate && addresses.some((a) => !isPublicIp(a.address))) {
        const blocked = Object.assign(new Error('blocked: host resolves to a non-public address'), { code: 'EBLOCKED' });
        return callback(blocked, '', 0);
      }
      if (options.all) return (callback as unknown as (e: null, a: typeof addresses) => void)(null, addresses);
      return callback(null, addresses[0].address, addresses[0].family);
    });
  };
}

export type OutboundResponse = Awaited<ReturnType<typeof undiciFetch>>;

/** `fetch` for user-supplied URLs: validates, refuses redirects (a 30x could
 * bounce to an internal address), connects only to public IPs, and times out.
 * Callers get the status but should never echo the response body to the user. */
export async function safeOutboundFetch(
  rawUrl: string,
  init: { method?: string; headers?: Record<string, string>; body?: string },
  opts: OutboundOptions & { timeoutMs?: number }
): Promise<OutboundResponse> {
  const check = validateOutboundUrl(rawUrl, opts);
  if (!check.ok) throw new OutboundBlockedError(check.reason);
  const dispatcher = new Agent({ connect: { lookup: guardedLookup(opts.allowPrivate) } });
  try {
    return await undiciFetch(check.url, {
      ...init,
      redirect: 'manual',
      dispatcher,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 5_000),
    });
  } finally {
    // Connection pool is single-use; closing doesn't abort the in-flight read.
    void dispatcher.close().catch(() => {});
  }
}

/** A user-safe description of why an outbound call failed. Raw network errors
 * (connection refused vs. timeout vs. DNS) would let a user probe internal
 * hosts, so only our own validation messages are passed through. */
export function describeOutboundError(err: unknown): string {
  if (err instanceof OutboundBlockedError) return err.message;
  const code = (err as { cause?: { code?: string } } | null)?.cause?.code;
  if (code === 'EBLOCKED') return 'URL resolves to a private or local address';
  if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) return 'Timed out';
  return 'Could not reach the URL';
}
