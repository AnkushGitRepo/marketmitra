import { describe, expect, it } from 'vitest';
import { tagsForActivity } from './activityTags';

describe('tagsForActivity', () => {
  it('tags a trailing-stop alert fire as STOP-LOSS', () => {
    expect(tagsForActivity({ kind: 'alert', meta: { alertType: 'trailing_stop' } })).toEqual([
      'STOP-LOSS',
    ]);
  });

  it('tags a cumulative-drawdown alert fire as DRAWDOWN', () => {
    expect(tagsForActivity({ kind: 'alert', meta: { alertType: 'cumulative_drawdown' } })).toEqual([
      'DRAWDOWN',
    ]);
  });

  it('tags other known alert types', () => {
    expect(tagsForActivity({ kind: 'alert', meta: { alertType: 'price_threshold' } })).toEqual([
      'PRICE TARGET',
    ]);
    expect(tagsForActivity({ kind: 'alert', meta: { alertType: 'percent_move' } })).toEqual([
      'BIG MOVE',
    ]);
    expect(tagsForActivity({ kind: 'alert', meta: { alertType: 'week52_breach' } })).toEqual([
      '52-WEEK',
    ]);
    expect(tagsForActivity({ kind: 'alert', meta: { alertType: 'portfolio_pnl' } })).toEqual([
      'PORTFOLIO',
    ]);
  });

  it('adds MITRA AUTO when the alert was created by an auto guardrail', () => {
    expect(
      tagsForActivity({ kind: 'alert', meta: { alertType: 'trailing_stop', source: 'auto_guardrail' } })
    ).toEqual(['STOP-LOSS', 'MITRA AUTO']);
  });

  it('adds MITRA AUTO when the alert was created by Mitra directly', () => {
    expect(
      tagsForActivity({ kind: 'alert', meta: { alertType: 'cumulative_drawdown', source: 'mitra' } })
    ).toEqual(['DRAWDOWN', 'MITRA AUTO']);
  });

  it('tags a guardrail-creation system notification as MITRA AUTO (no alertType)', () => {
    expect(tagsForActivity({ kind: 'system', meta: { source: 'auto_guardrail' } })).toEqual([
      'MITRA AUTO',
    ]);
  });

  it('falls back to SYSTEM for a system notification with no recognizable meta', () => {
    expect(tagsForActivity({ kind: 'system', meta: {} })).toEqual(['SYSTEM']);
  });

  it('returns no tags for a plain alert fire with unrecognized type and no source', () => {
    expect(tagsForActivity({ kind: 'alert', meta: { alertType: 'ipo_watch' } })).toEqual([]);
  });

  it('ignores a user-created alert (no MITRA AUTO tag)', () => {
    expect(
      tagsForActivity({ kind: 'alert', meta: { alertType: 'trailing_stop', source: 'user' } })
    ).toEqual(['STOP-LOSS']);
  });
});
