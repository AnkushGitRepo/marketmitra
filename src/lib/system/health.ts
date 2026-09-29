// Live component health checks backing /api/status (public) and
// /dashboard/system (ADR 0029). Every check is best-effort and time-boxed —
// a slow/unreachable dependency reports 'down', it never hangs the page.

import { getDb } from '@/lib/mongodb';
import { rateLimitEnabled, pingRedis } from '@/lib/rateLimit';
import { isHosted } from '@/lib/deployment-mode';
import { tools } from '@/lib/mcp/tools';
import { latestEventPerSource, type SystemEvent } from './eventLog';

export type ComponentStatus = 'operational' | 'degraded' | 'down' | 'not_configured';

export interface ComponentHealth {
  id: string;
  label: string;
  status: ComponentStatus;
  detail?: string;
  latencyMs?: number;
}

export interface CronStatus {
  id: string;
  label: string;
  lastRun: SystemEvent | null;
}

export interface SystemStatus {
  checkedAt: string;
  overall: ComponentStatus;
  components: ComponentHealth[];
  crons: CronStatus[];
}

const CHECK_TIMEOUT_MS = 5000;

function message(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

async function timed<T>(fn: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const started = Date.now();
  const value = await fn();
  return { ms: Date.now() - started, value };
}

async function checkMongo(): Promise<ComponentHealth> {
  const id = 'mongodb';
  const label = 'MongoDB Atlas';
  try {
    const { ms } = await timed(async () => {
      const db = await getDb();
      await db.command({ ping: 1 });
    });
    return { id, label, status: 'operational', latencyMs: ms };
  } catch (err) {
    return { id, label, status: 'down', detail: message(err) };
  }
}

async function checkFundamentalsApi(): Promise<ComponentHealth> {
  const id = 'fundamentals-api';
  const label = 'Fundamentals API';
  const base = process.env.FUNDAMENTALS_API_URL ?? 'http://localhost:8420';
  try {
    const { ms, value: res } = await timed(() =>
      fetch(`${base}/health`, { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS), cache: 'no-store' })
    );
    if (!res.ok) return { id, label, status: 'degraded', detail: `HTTP ${res.status}`, latencyMs: ms };
    return { id, label, status: 'operational', latencyMs: ms };
  } catch (err) {
    return { id, label, status: 'down', detail: message(err) };
  }
}

/** Co-located in this same Next.js deployment (not a separate service), so
 * "health" here means "the tool registry loaded" — real dependencies it
 * calls into (Mongo, fundamentals-api) are checked separately above. */
function checkMcp(): ComponentHealth {
  const id = 'mcp';
  const label = 'MCP server';
  if (tools.length > 0) {
    return { id, label, status: 'operational', detail: `${tools.length} tools registered` };
  }
  return { id, label, status: 'down', detail: 'No tools registered' };
}

async function checkRateLimiter(): Promise<ComponentHealth> {
  const id = 'rate-limit';
  const label = 'Rate limiting (Upstash)';
  if (!rateLimitEnabled) {
    return { id, label, status: 'not_configured', detail: 'No Upstash credentials — self-host runs unthrottled' };
  }
  try {
    const { ms } = await timed(pingRedis);
    return { id, label, status: 'operational', latencyMs: ms };
  } catch (err) {
    return { id, label, status: 'down', detail: message(err) };
  }
}

/** Config-presence, not a live network ping — Clerk has no documented
 * per-project health endpoint to call safely, so this reports whether
 * hosted mode has its keys set rather than fabricating a connectivity
 * check. */
function checkAuth(): ComponentHealth {
  const id = 'auth';
  const label = 'Authentication (Clerk)';
  if (!isHosted()) {
    return { id, label, status: 'not_configured', detail: 'Self-host mode — no login required' };
  }
  const configured = Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  return configured
    ? { id, label, status: 'operational', detail: 'Configured' }
    : { id, label, status: 'down', detail: 'CLERK_SECRET_KEY / publishable key missing' };
}

const CRON_SOURCES: Array<{ id: string; label: string }> = [
  { id: 'cron:evaluate-alerts', label: 'Alert evaluation' },
  { id: 'cron:index-corpus', label: 'Corpus indexing' },
  { id: 'cron:agents-reflect', label: 'Agent reflection' },
];

function worstOf(statuses: ComponentStatus[]): ComponentStatus {
  if (statuses.includes('down')) return 'down';
  if (statuses.includes('degraded')) return 'degraded';
  return 'operational';
}

export async function getSystemStatus(): Promise<SystemStatus> {
  const [mongo, fundamentalsApi, rateLimiter, auth] = await Promise.all([
    checkMongo(),
    checkFundamentalsApi(),
    checkRateLimiter(),
    Promise.resolve(checkAuth()),
  ]);
  const mcp = checkMcp();

  const components = [mongo, fundamentalsApi, mcp, rateLimiter, auth];

  let cronEvents: Record<string, SystemEvent | null> = {};
  try {
    cronEvents = await latestEventPerSource(CRON_SOURCES.map((c) => c.id));
  } catch {
    /* the crons table just shows "no data" — not fatal to the page */
  }
  const crons: CronStatus[] = CRON_SOURCES.map((c) => ({
    id: c.id,
    label: c.label,
    lastRun: cronEvents[c.id] ?? null,
  }));

  // Overall status only weighs the things a visitor actually depends on —
  // rate limiting and auth being "not_configured" (self-host, or hosted
  // pre-provisioning) is expected, not an incident.
  const overall = worstOf([mongo.status, fundamentalsApi.status, mcp.status]);

  return { checkedAt: new Date().toISOString(), overall, components, crons };
}
