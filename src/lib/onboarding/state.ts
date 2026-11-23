// Who sees the first-run wizard. Pure, so the layout redirect is testable without a database.

export interface OnboardingState {
  /** null when the count could not be read: we then fail open and never redirect. */
  readonly holdingsCount: number | null;
  readonly completed: boolean;
  readonly dismissed: boolean;
}

export function shouldOnboard({ holdingsCount, completed, dismissed }: OnboardingState): boolean {
  if (completed || dismissed) return false;
  return holdingsCount === 0;
}
