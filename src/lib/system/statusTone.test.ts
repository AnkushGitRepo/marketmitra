import { describe, expect, it } from 'vitest';
import { TONE_LABEL, statusTone } from './statusTone';

describe('statusTone', () => {
  it('maps the three real states', () => {
    expect(statusTone('operational')).toBe('ok');
    expect(statusTone('degraded')).toBe('warn');
    expect(statusTone('down')).toBe('bad');
  });

  it('never reports ok for anything it does not recognise', () => {
    for (const v of ['not_configured', '', undefined, null, 42, {}, 'OPERATIONAL']) expect(statusTone(v)).toBe('unknown');
  });

  it('has a label for every tone', () => {
    for (const t of ['ok', 'warn', 'bad', 'unknown'] as const) expect(TONE_LABEL[t].length).toBeGreaterThan(3);
  });
});
