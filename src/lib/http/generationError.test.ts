import { describe, expect, it } from 'vitest';
import { generationError } from './generationError';

describe('generationError', () => {
  it('keeps the API\'s own message and turns a missing key into the Settings hint', () => {
    expect(generationError(502, 'The model returned an unreadable reply.')).toBe('The model returned an unreadable reply.');
    expect(generationError(400, 'no_ai_key')).toBe('Add your AI key in Settings first.');
  });
  it('explains a timeout in plain words when the body was not JSON', () => {
    for (const s of [408, 502, 504, 524]) expect(generationError(s, undefined)).toMatch(/took too long/i);
  });
  it('says a session problem is a session problem, and falls back to a generic line otherwise', () => {
    expect(generationError(401, undefined)).toMatch(/session/i);
    expect(generationError(500, undefined)).toBe('Could not generate the brief right now. Try again in a moment.');
    expect(generationError(500, '  ', 'the read')).toBe('Could not generate the read right now. Try again in a moment.');
  });
  it('never returns a parser error message', () => {
    for (const s of [200, 401, 500, 504]) expect(generationError(s, undefined)).not.toMatch(/expected pattern|JSON|Unexpected token/i);
  });
});
