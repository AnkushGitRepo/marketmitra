import { describe, expect, it } from 'vitest';
import type { Ipo } from '@/lib/dashboard/iposApi';
import { ipoBriefTargets, sweepIpoBriefs, type BriefOutcome } from './ipoBriefSweep';

const ipo = (slug: string, over: Partial<Ipo> = {}): Ipo => ({ slug, status: 'open', price: 100, ipo_size_cr: 50, ...over }) as Ipo;

describe('ipoBriefTargets', () => {
  it('keeps open and upcoming IPOs with enough data, open first', () => {
    const targets = ipoBriefTargets([
      ipo('up', { status: 'upcoming' }),
      ipo('closed', { status: 'closed' }),
      ipo('listed', { status: 'listed' }),
      ipo('bare', { price: null, ipo_size_cr: null }),
      ipo('open'),
    ]);
    expect(targets.map((i) => i.slug)).toEqual(['open', 'up']);
  });
});

describe('sweepIpoBriefs', () => {
  const run = (ipos: Ipo[], generate: (i: Ipo) => Promise<BriefOutcome>, now = () => 0, concurrency = 2, deadline = 1000) =>
    sweepIpoBriefs(ipos, { generate, now }, { concurrency, deadline });

  it('counts generated, already-fresh and failed briefs and reports the failure reason', async () => {
    const out = await run([ipo('a'), ipo('b'), ipo('c')], async (i) => (i.slug === 'a' ? { ok: true, cached: true } : i.slug === 'b' ? { ok: true, cached: false } : { ok: false, error: 'quota' }));
    expect(out.counts).toEqual({ generated: 1, alreadyFresh: 1, failed: 1, deferred: 0 });
    expect(out.failures).toEqual([{ slug: 'c', error: 'quota' }]);
  });

  it('never runs more than the concurrency limit at once', async () => {
    let active = 0;
    let peak = 0;
    await run([ipo('a'), ipo('b'), ipo('c'), ipo('d'), ipo('e')], async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return { ok: true, cached: false };
    });
    expect(peak).toBe(2);
  });

  it('stops starting briefs once the time budget is spent and counts the rest as deferred', async () => {
    let clock = 0;
    const out = await run(
      [ipo('a'), ipo('b'), ipo('c'), ipo('d')],
      async () => {
        clock += 600; // each brief "takes" 600 ms of the 1000 ms budget
        return { ok: true, cached: false };
      },
      () => clock,
      1
    );
    expect(out.counts).toMatchObject({ generated: 2, deferred: 2 });
  });

  it('does nothing for an empty list', async () => {
    expect((await run([], async () => ({ ok: true, cached: false }))).counts).toEqual({ generated: 0, alreadyFresh: 0, failed: 0, deferred: 0 });
  });
});
