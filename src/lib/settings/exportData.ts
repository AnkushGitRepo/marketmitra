// Shapes the "export my data" download (ADR 0038). Pure: the route gathers the lists,
// this strips internal identifiers and wraps them in a versioned document.
// Deliberately NOT included: API keys, notification channel secrets, attachment bytes
// (conversations keep only the file references).

const INTERNAL_KEYS = new Set(['userId']);

/** Deep copy without internal identifiers; Dates become ISO strings, ObjectId-like values become strings. */
export function stripInternal(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripInternal);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.toHexString === 'function') return String(obj);
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([k]) => !INTERNAL_KEYS.has(k))
        .map(([k, v]) => [k, stripInternal(v)])
    );
  }
  return value;
}

export interface ExportParts {
  readonly holdings: readonly unknown[];
  readonly notes: readonly unknown[];
  readonly alerts: readonly unknown[];
  readonly wishlists: readonly unknown[];
  readonly conversations: ReadonlyArray<{ readonly conversation: unknown; readonly messages: readonly unknown[] }>;
  readonly preferences: unknown;
}

export const EXPORT_VERSION = 1;

export function buildExportDocument(parts: ExportParts, now: Date) {
  return {
    app: 'MarketMitra',
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    note: 'Your data only. API keys and notification secrets are never exported, and chat attachments are listed by reference, not included.',
    holdings: stripInternal(parts.holdings),
    notes: stripInternal(parts.notes),
    alerts: stripInternal(parts.alerts),
    wishlists: stripInternal(parts.wishlists),
    conversations: stripInternal(parts.conversations),
    preferences: stripInternal(parts.preferences),
  };
}

export function exportFilename(now: Date): string {
  return `marketmitra-export-${now.toISOString().slice(0, 10)}.json`;
}
