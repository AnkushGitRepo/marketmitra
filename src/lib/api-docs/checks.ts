// Pass/fail assertions for the API reference's Try it. Pure: evaluated against an
// already-received response, never touches the network.

export type Check =
  | { kind: 'status'; equals: number }
  | { kind: 'header'; name: string; contains: string }
  | { kind: 'jsonPath'; path: string; mode: 'exists' | 'equals'; value?: string }
  | { kind: 'latency'; maxMs: number };

export interface CheckTarget {
  status: number;
  /** Header names lower-cased. */
  headers: Record<string, string>;
  body: string;
  /** Round-trip time in ms, when measured. */
  ms?: number;
}

export interface CheckResult {
  check: Check;
  passed: boolean;
  detail: string;
}

export interface CheckReport {
  passed: boolean;
  results: CheckResult[];
}

export type PathRead = { found: true; value: unknown } | { found: false };

/** Reads `a.b[0].c`. Own properties only, so `constructor` / `__proto__` never resolve. */
export function readPath(doc: unknown, path: string): PathRead {
  const tokens = path.match(/[^.[\]]+/g) ?? [];
  let cur: unknown = doc;
  for (const t of tokens) {
    if (cur === null || typeof cur !== 'object') return { found: false };
    if (!Object.prototype.hasOwnProperty.call(cur, t)) return { found: false };
    cur = (cur as Record<string, unknown>)[t];
  }
  return tokens.length === 0 ? { found: false } : { found: true, value: cur };
}

/** JSON body, or the JSON inside an SSE `data:` line (the MCP endpoint). */
export function parseJsonBody(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    for (const line of body.split('\n')) {
      if (!line.startsWith('data:')) continue;
      try {
        return JSON.parse(line.slice(5).trim());
      } catch {
        /* try the next data line */
      }
    }
    return undefined;
  }
}

function describeValue(v: unknown): string {
  return typeof v === 'string' ? v : JSON.stringify(v);
}

function evaluateOne(check: Check, target: CheckTarget, json: unknown): CheckResult {
  switch (check.kind) {
    case 'status': {
      const passed = target.status === check.equals;
      return { check, passed, detail: passed ? `status is ${check.equals}` : `expected ${check.equals}, got ${target.status}` };
    }
    case 'header': {
      const actual = target.headers[check.name.toLowerCase()];
      if (actual === undefined) return { check, passed: false, detail: `header "${check.name}" is missing` };
      const passed = actual.includes(check.contains);
      return { check, passed, detail: passed ? `"${check.name}" contains "${check.contains}"` : `"${check.name}" is "${actual}"` };
    }
    case 'latency': {
      if (target.ms === undefined) return { check, passed: false, detail: 'latency was not measured' };
      const passed = target.ms <= check.maxMs;
      return { check, passed, detail: passed ? `latency ${target.ms}ms < ${check.maxMs}ms` : `latency ${target.ms}ms, limit ${check.maxMs}ms` };
    }
    case 'jsonPath': {
      if (json === undefined) return { check, passed: false, detail: 'response body is not JSON' };
      const read = readPath(json, check.path);
      if (!read.found) return { check, passed: false, detail: `${check.path} not found` };
      if (check.mode === 'exists') return { check, passed: true, detail: `${check.path} exists` };
      const actual = describeValue(read.value);
      const passed = actual === (check.value ?? '');
      return { check, passed, detail: passed ? `${check.path} is ${actual}` : `${check.path} is ${actual}, expected ${check.value ?? ''}` };
    }
  }
}

export function evaluateChecks(checks: readonly Check[], target: CheckTarget): CheckReport {
  const json = parseJsonBody(target.body);
  const results = checks.map((c) => evaluateOne(c, target, json));
  return { passed: results.length > 0 && results.every((r) => r.passed), results };
}

/** Start with "status equals the first documented 2xx". */
export function defaultChecks(documentedCodes: readonly string[]): Check[] {
  const ok = documentedCodes.find((c) => /^2\d\d$/.test(c));
  return [{ kind: 'status', equals: ok ? Number(ok) : 200 }];
}
