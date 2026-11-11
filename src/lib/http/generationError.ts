// Turns a failed AI-generation response into a sentence a person can act on (#162). The raw parser error of `response.json()` on a non-JSON body (Safari:
// "The string did not match the expected pattern.") must never reach the user. Pure.

const TIMEOUT_STATUSES: readonly number[] = [408, 502, 504, 524];

/** What to tell the user when generation failed. `apiError` is the `error` field of the JSON body, when there was one. */
export function generationError(status: number, apiError: string | undefined, what = 'the brief'): string {
  if (apiError === 'no_ai_key') return 'Add your AI key in Settings first.';
  if (apiError && apiError.trim()) return apiError;
  if (status === 401 || status === 403) return 'Your session may have expired. Sign in again and retry.';
  if (TIMEOUT_STATUSES.includes(status)) return 'Mitra took too long to answer. Try again; a slow model can need a second go.';
  return `Could not generate ${what} right now. Try again in a moment.`;
}
