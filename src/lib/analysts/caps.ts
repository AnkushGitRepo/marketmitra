// The cost guard for automatic analysts (#128): a per-user daily cap on AI calls, and when the daily check runs. Pure, in India time.

/** The hosted cap: a hosted user's own key is spent unattended, so it stays small. */
export const DAILY_AI_CAP = 20;
/** A local or self-hosted instance serves one person on their own machine and key, so the default is generous. */
export const LOCAL_DAILY_AI_CAP = 200;
const MAX_DAILY_AI_CAP = 1000;

/** Hosted is always the fixed cap. Otherwise `override` (an env value) when it is a whole number, kept between the hosted cap and a sane maximum. */
export function resolveDailyCap(hosted: boolean, override: string | undefined): number {
  if (hosted) return DAILY_AI_CAP;
  const n = override === undefined || override.trim() === '' ? NaN : Number(override);
  if (!Number.isInteger(n)) return LOCAL_DAILY_AI_CAP;
  return Math.min(MAX_DAILY_AI_CAP, Math.max(DAILY_AI_CAP, n));
}
/** Markets close at 15:30 IST; the end-of-day check waits for the close plus a buffer. */
const HEARTBEAT_FROM_HOUR_IST = 16;
const IST = 'Asia/Kolkata';

export interface Usage {
  day: string;
  count: number;
}

export function istDay(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function istHour(now: Date): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: IST, hour: '2-digit', hourCycle: 'h23' }).format(now));
}

const today = (usage: Usage, now: Date): Usage => (usage.day === istDay(now) ? usage : { day: istDay(now), count: 0 });

export function canSpend(usage: Usage, now: Date, cap: number): boolean {
  return today(usage, now).count < cap;
}

export function recordSpend(usage: Usage, now: Date): Usage {
  const t = today(usage, now);
  return { day: t.day, count: t.count + 1 };
}

/** The end-of-day check is due once per India day, after the close buffer. */
export function isHeartbeatDue(lastCheckedAt: Date | null, now: Date): boolean {
  if (istHour(now) < HEARTBEAT_FROM_HOUR_IST) return false;
  return lastCheckedAt === null || istDay(lastCheckedAt) < istDay(now);
}
