// The friction in front of an irreversible action: the user has to type a word, not just click.

export const DELETE_PHRASE = 'DELETE';

/** True only for exactly the phrase (surrounding spaces ignored); a wrong case or a partial match does not count. */
export function isPhraseConfirmed(input: string, phrase: string = DELETE_PHRASE): boolean {
  return input.trim() === phrase;
}
