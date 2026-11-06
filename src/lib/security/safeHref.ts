/** A link safe to put in an `<a href>`: http(s) only, else "#". Untrusted feeds
 * (news RSS, filings) can contain `javascript:` URLs, which would run script
 * on click. */
export function safeHref(raw: string | null | undefined): string {
  if (!raw) return '#';
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || u.protocol === 'http:' ? raw : '#';
  } catch {
    return '#';
  }
}
