export type FooterTone = 'ok' | 'warn' | 'bad' | 'unknown';

/** Maps the overall status from `GET /api/status` to the footer dot. Anything unexpected is "unknown", never "ok". */
export function statusTone(overall: unknown): FooterTone {
  if (overall === 'operational') return 'ok';
  if (overall === 'degraded') return 'warn';
  if (overall === 'down') return 'bad';
  return 'unknown';
}

export const TONE_LABEL: Record<FooterTone, string> = {
  ok: 'All systems operational',
  warn: 'Some systems degraded',
  bad: 'Service disruption',
  unknown: 'Status',
};
