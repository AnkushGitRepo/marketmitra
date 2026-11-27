// Date wording for the tax page. Built from the YYYY-MM-DD text itself, with no locale or time zone, so the server and
// the browser always print the same thing (a locale-formatted date can differ between them and break hydration).

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** "2026-03-01" as "1 Mar 2026"; anything else comes back unchanged. */
export function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month} ${m[1]}` : iso;
}
