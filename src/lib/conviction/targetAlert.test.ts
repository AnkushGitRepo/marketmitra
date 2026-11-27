import { describe, expect, it } from 'vitest';
import { targetAlertNote, targetAlertParams } from './targetAlert';

describe('targetAlertParams', () => {
  it('maps an entry at or below the target to a "below" price alert', () =>
    expect(targetAlertParams(90, 'at_or_below')).toEqual({ direction: 'below', threshold: 90 }));
  it('maps a breakout entry to an "above" price alert', () =>
    expect(targetAlertParams(120, 'at_or_above')).toEqual({ direction: 'above', threshold: 120 }));
});

describe('targetAlertNote', () => {
  it('names the symbol and the side', () => expect(targetAlertNote('TCS', 'at_or_below')).toContain('TCS at or below'));
});
