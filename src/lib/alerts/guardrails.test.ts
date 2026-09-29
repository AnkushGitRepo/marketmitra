import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Alert } from './types';

const { createAlert, getAutoGuardrailsEnabled, logMitraAction, deliverNotification, resolveChannels } =
  vi.hoisted(() => ({
    createAlert: vi.fn<(...args: unknown[]) => Promise<Alert>>(),
    getAutoGuardrailsEnabled: vi.fn<(...args: unknown[]) => Promise<boolean>>(async () => true),
    logMitraAction: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({})),
    deliverNotification: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({})),
    resolveChannels: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({})),
  }));

vi.mock('./store', () => ({ createAlert }));
vi.mock('@/lib/userSettings', () => ({ getAutoGuardrailsEnabled }));
vi.mock('@/lib/mitra/activityLog', () => ({ logMitraAction }));
vi.mock('@/lib/notifications/deliver', () => ({ deliverNotification, resolveChannels }));

import { createGuardrailAlertsForHolding } from './guardrails';

const NOW = new Date('2026-09-29T06:00:00.000Z');

function fakeAlert(over: Partial<Alert>): Alert {
  return {
    id: 'a1',
    userId: 'u1',
    type: 'trailing_stop',
    symbol: 'RELIANCE',
    params: { trailPct: 10 },
    note: null,
    status: 'active',
    rearm: true,
    cooldownMinutes: 240,
    armed: true,
    cooldownUntil: null,
    lastEvaluatedAt: null,
    triggeredAt: null,
    lastObservedValue: null,
    sentKeys: null,
    peakPrice: null,
    source: 'auto_guardrail',
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getAutoGuardrailsEnabled.mockResolvedValue(true);
  createAlert.mockImplementation(async (...args: unknown[]) => {
    const input = args[1] as { type: Alert['type'] };
    return fakeAlert({ id: input.type === 'trailing_stop' ? 'ts1' : 'cd1', type: input.type });
  });
});

describe('createGuardrailAlertsForHolding', () => {
  it('creates a trailing_stop + cumulative_drawdown pair, logs both, and notifies once', async () => {
    const created = await createGuardrailAlertsForHolding('u1', 'reliance');

    expect(created).toHaveLength(2);
    expect(createAlert).toHaveBeenCalledTimes(2);
    expect(createAlert.mock.calls.map((c) => (c[1] as { type: string }).type).sort()).toEqual(
      ['cumulative_drawdown', 'trailing_stop'].sort()
    );
    // symbol is uppercased regardless of how the caller passed it
    for (const call of createAlert.mock.calls) {
      expect((call[1] as { symbol: string }).symbol).toBe('RELIANCE');
      expect((call[1] as { source: string }).source).toBe('auto_guardrail');
    }
    expect(logMitraAction).toHaveBeenCalledTimes(2);
    for (const call of logMitraAction.mock.calls) {
      const arg = call[0] as { reason: string; source: string; action: string };
      expect(arg.action).toBe('alert_created');
      expect(arg.source).toBe('auto_guardrail');
      expect(arg.reason.length).toBeGreaterThan(0);
    }
    expect(deliverNotification).toHaveBeenCalledOnce();
    const [userId, payload] = deliverNotification.mock.calls[0] as [string, { kind: string; body: string }];
    expect(userId).toBe('u1');
    expect(payload.kind).toBe('system');
    expect(payload.body).toContain('RELIANCE');
  });

  it('does nothing when the user has turned auto-guardrails off', async () => {
    getAutoGuardrailsEnabled.mockResolvedValue(false);

    const created = await createGuardrailAlertsForHolding('u1', 'RELIANCE');

    expect(created).toEqual([]);
    expect(createAlert).not.toHaveBeenCalled();
    expect(deliverNotification).not.toHaveBeenCalled();
  });

  it('never throws — a guardrail-creation failure returns an empty array instead of blocking the caller', async () => {
    createAlert.mockRejectedValue(new Error('db down'));

    await expect(createGuardrailAlertsForHolding('u1', 'RELIANCE')).resolves.toEqual([]);
  });
});
