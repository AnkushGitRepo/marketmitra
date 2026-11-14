// One dossier build per user and symbol inside this process. The sweep and Analyze now share it
// so they cannot spend the AI key twice on the same stock (ADR 0062).

const inFlight = new Set<string>();

function keyOf(userId: string, symbol: string): string {
  return `${userId}:${symbol.trim().toUpperCase()}`;
}

/** True when this call owns the build. False when one is already running. */
export function tryClaimInitiate(userId: string, symbol: string): boolean {
  const key = keyOf(userId, symbol);
  if (inFlight.has(key)) return false;
  inFlight.add(key);
  return true;
}

export function releaseInitiate(userId: string, symbol: string): void {
  inFlight.delete(keyOf(userId, symbol));
}
