// Background pre-generation of the shared IPO briefs (#287): a viewer opens an already-written brief instead of waiting for one.
// Pure apart from the injected `generate`, so the ordering, concurrency and time limit test without a model or a database.

import type { Ipo } from '@/lib/dashboard/iposApi';
import { hasEnoughIpoData } from './briefPrompts';

export interface SweepCounts {
  generated: number;
  alreadyFresh: number;
  failed: number;
  /** Not started because the time budget ran out; the next run picks them up. */
  deferred: number;
}

export interface SweepResult {
  counts: SweepCounts;
  /** Slugs whose generation failed, with the (key-free) reason. */
  failures: ReadonlyArray<{ slug: string; error: string }>;
}

export type BriefOutcome = { ok: true; cached: boolean } | { ok: false; error: string };

export interface SweepDeps {
  generate: (ipo: Ipo) => Promise<BriefOutcome>;
  now: () => number;
}

export interface SweepOptions {
  concurrency: number;
  /** No new generation starts after this time (ms since epoch). */
  deadline: number;
}

const STATUS_ORDER: Readonly<Record<string, number>> = { open: 0, upcoming: 1 };

/** The IPOs worth a brief ahead of time: open or upcoming with enough data, open first (the ones people are deciding on now). */
export function ipoBriefTargets(ipos: readonly Ipo[]): Ipo[] {
  return ipos
    .filter((i) => i.status in STATUS_ORDER && hasEnoughIpoData(i))
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
}

export async function sweepIpoBriefs(ipos: readonly Ipo[], deps: SweepDeps, opts: SweepOptions): Promise<SweepResult> {
  const queue = ipoBriefTargets(ipos);
  const counts: SweepCounts = { generated: 0, alreadyFresh: 0, failed: 0, deferred: 0 };
  const failures: Array<{ slug: string; error: string }> = [];

  async function worker(): Promise<void> {
    for (let ipo = queue.shift(); ipo; ipo = queue.shift()) {
      if (deps.now() >= opts.deadline) {
        counts.deferred += 1 + queue.length;
        queue.length = 0;
        return;
      }
      const outcome = await deps.generate(ipo);
      if (!outcome.ok) {
        counts.failed += 1;
        failures.push({ slug: ipo.slug, error: outcome.error });
      } else if (outcome.cached) {
        counts.alreadyFresh += 1;
      } else {
        counts.generated += 1;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency) }, worker));
  return { counts, failures };
}
