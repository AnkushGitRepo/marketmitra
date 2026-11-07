import { policySchema, type InvestmentPolicy } from './schema';

// Portable policy file. JSON (no new dependency); the envelope lets a future
// format change be detected rather than silently misread.
const FORMAT = 'marketmitra.advisor.policy';
const FORMAT_VERSION = 1;

export function exportPolicy(policy: InvestmentPolicy): string {
  return JSON.stringify({ format: FORMAT, version: FORMAT_VERSION, policy }, null, 2);
}

export type ImportResult =
  | { ok: true; policy: InvestmentPolicy }
  | { ok: false; errors: string[] };

export function importPolicy(text: string): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['That file is not valid JSON.'] };
  }
  const envelope = raw as { format?: unknown; version?: unknown; policy?: unknown } | null;
  // Accept a bare policy object too, so a hand-written file works.
  const candidate = envelope && envelope.format === FORMAT ? envelope.policy : raw;
  if (envelope && envelope.format === FORMAT && envelope.version !== FORMAT_VERSION) {
    return { ok: false, errors: [`Unsupported policy file version: ${String(envelope.version)}.`] };
  }
  const parsed = policySchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join('.') || 'policy'}: ${i.message}`),
    };
  }
  return { ok: true, policy: parsed.data };
}
