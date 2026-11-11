import { describe, expect, it } from 'vitest';
import { defaultChecks, evaluateChecks, parseJsonBody, readPath, type Check, type CheckTarget } from './checks';

const target = (over: Partial<CheckTarget> = {}): CheckTarget => ({
  status: 200,
  headers: { 'content-type': 'application/json', 'ratelimit-limit': '60' },
  body: JSON.stringify({ success: true, data: { items: [{ symbol: 'TCS' }], count: 1 } }),
  ...over,
});

describe('readPath', () => {
  const doc = { a: { b: [{ c: 5 }, { c: 6 }] }, n: null };
  it('reads dotted keys and array indexes', () => {
    expect(readPath(doc, 'a.b[1].c')).toEqual({ found: true, value: 6 });
    expect(readPath(doc, 'a.b[0]')).toEqual({ found: true, value: { c: 5 } });
  });
  it('treats null as found and a missing key as not found', () => {
    expect(readPath(doc, 'n')).toEqual({ found: true, value: null });
    expect(readPath(doc, 'a.zzz')).toEqual({ found: false });
    expect(readPath(doc, 'a.b[9].c')).toEqual({ found: false });
  });
  it('does not walk the prototype chain', () => {
    expect(readPath(doc, 'constructor')).toEqual({ found: false });
    expect(readPath(doc, '__proto__')).toEqual({ found: false });
  });
});

describe('parseJsonBody', () => {
  it('parses plain JSON', () => expect(parseJsonBody('{"a":1}')).toEqual({ a: 1 }));
  it('pulls the JSON out of an SSE data line (the MCP endpoint)', () =>
    expect(parseJsonBody('event: message\ndata: {"result":{"ok":true}}\n\n')).toEqual({ result: { ok: true } }));
  it('returns undefined for non-JSON', () => expect(parseJsonBody('<html>')).toBeUndefined());
});

describe('evaluateChecks', () => {
  const run = (checks: Check[], t = target()) => evaluateChecks(checks, t);

  it('passes a matching status and fails a different one', () => {
    expect(run([{ kind: 'status', equals: 200 }]).passed).toBe(true);
    const r = run([{ kind: 'status', equals: 201 }]);
    expect(r.passed).toBe(false);
    expect(r.results[0].detail).toContain('200');
  });

  it('matches headers case-insensitively by substring', () => {
    expect(run([{ kind: 'header', name: 'Content-Type', contains: 'json' }]).passed).toBe(true);
    expect(run([{ kind: 'header', name: 'x-missing', contains: '' }]).passed).toBe(false);
  });

  it('checks JSON paths for existence and equality (string-typed expected value)', () => {
    expect(run([{ kind: 'jsonPath', path: 'data.items[0].symbol', mode: 'exists' }]).passed).toBe(true);
    expect(run([{ kind: 'jsonPath', path: 'data.count', mode: 'equals', value: '1' }]).passed).toBe(true);
    expect(run([{ kind: 'jsonPath', path: 'success', mode: 'equals', value: 'true' }]).passed).toBe(true);
    expect(run([{ kind: 'jsonPath', path: 'data.items[0].symbol', mode: 'equals', value: 'INFY' }]).passed).toBe(false);
  });

  it('fails JSON checks cleanly when the body is not JSON', () => {
    const r = run([{ kind: 'jsonPath', path: 'a', mode: 'exists' }], target({ body: 'oops' }));
    expect(r.passed).toBe(false);
    expect(r.results[0].detail).toMatch(/not JSON/i);
  });

  it('is overall-failed if any check fails, and reports every check', () => {
    const r = run([
      { kind: 'status', equals: 200 },
      { kind: 'jsonPath', path: 'nope', mode: 'exists' },
    ]);
    expect(r.passed).toBe(false);
    expect(r.results.map((x) => x.passed)).toEqual([true, false]);
  });

  it('an empty check list is not a pass', () => expect(run([]).passed).toBe(false));
});

describe('defaultChecks', () => {
  it('asserts the first documented 2xx status', () => {
    expect(defaultChecks(['404', '201', '200'])).toEqual([{ kind: 'status', equals: 201 }]);
  });
  it('falls back to 200', () => expect(defaultChecks([])).toEqual([{ kind: 'status', equals: 200 }]));
});
