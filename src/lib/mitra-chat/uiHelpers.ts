interface ConversationLike {
  readonly id: string;
  /** A Date server-side, an ISO string once it has crossed the API. */
  readonly updatedAt: Date | string;
}

export interface ConversationGroup<T> {
  readonly label: 'Today' | 'Yesterday' | 'Previous 7 days' | 'Older';
  readonly items: readonly T[];
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const DAY = 86_400_000;

/** Buckets conversations (already newest-first) for the history rail. Empty groups are omitted. */
export function groupByRecency<T extends ConversationLike>(items: readonly T[], now: Date): ConversationGroup<T>[] {
  const today = startOfDay(now);
  const buckets: Record<ConversationGroup<T>['label'], T[]> = { Today: [], Yesterday: [], 'Previous 7 days': [], Older: [] };
  for (const item of items) {
    const age = today - startOfDay(new Date(item.updatedAt));
    const label = age <= 0 ? 'Today' : age <= DAY ? 'Yesterday' : age <= 7 * DAY ? 'Previous 7 days' : 'Older';
    buckets[label].push(item);
  }
  return (Object.keys(buckets) as ConversationGroup<T>['label'][])
    .filter((label) => buckets[label].length > 0)
    .map((label) => ({ label, items: buckets[label] }));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(bytes < 10_000 ? 1 : 0)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/** Parses a persisted on/off flag; anything but an explicit "1" is off. */
export function parseStoredFlag(raw: string | null): boolean {
  return raw === '1';
}
