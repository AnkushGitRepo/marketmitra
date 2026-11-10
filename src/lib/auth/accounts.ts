// Pure helpers for the Settings > Account & security section (hosted mode, Clerk).

export type MultiSessionState = 'enabled' | 'disabled' | 'unknown';

/** Clerk exposes `singleSessionMode` (true = one account at a time). Anything else means we can't tell. */
export function multiSessionState(singleSessionMode: unknown): MultiSessionState {
  if (singleSessionMode === true) return 'disabled';
  if (singleSessionMode === false) return 'enabled';
  return 'unknown';
}

export interface AccountSessionLike {
  readonly id: string;
  readonly status: string;
  readonly publicUserData?: {
    readonly firstName?: string | null;
    readonly lastName?: string | null;
    readonly identifier?: string | null;
    readonly imageUrl?: string | null;
  } | null;
}

export interface AccountRow {
  readonly id: string;
  readonly name: string;
  readonly identifier: string;
  readonly imageUrl: string | null;
  readonly current: boolean;
}

/** "First Last" when present, else the identifier (email/username), else a neutral label. */
export function displayName(data: AccountSessionLike['publicUserData']): string {
  const full = [data?.firstName, data?.lastName].filter(Boolean).join(' ').trim();
  return full || data?.identifier || 'Account';
}

/** Active sessions only, current account first, the rest in their original order. */
export function buildAccountRows(sessions: readonly AccountSessionLike[], currentSessionId: string | null): AccountRow[] {
  const rows = sessions
    .filter((s) => s.status === 'active')
    .map((s) => ({
      id: s.id,
      name: displayName(s.publicUserData),
      identifier: s.publicUserData?.identifier ?? '',
      imageUrl: s.publicUserData?.imageUrl || null,
      current: s.id === currentSessionId,
    }));
  return [...rows.filter((r) => r.current), ...rows.filter((r) => !r.current)];
}
