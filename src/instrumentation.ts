// Runs once when a Node server starts (Next.js instrumentation). The local analyst catch-up must not
// block startup and must not load on the edge runtime or during `next build` (ADR 0062).

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'edge') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  const { startLocalAiSchedule } = await import('@/lib/scheduler/localAiSchedule');
  startLocalAiSchedule();
}
