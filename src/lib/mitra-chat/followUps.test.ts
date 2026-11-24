import { describe, expect, it } from 'vitest';
import { splitFollowUps } from './followUps';

const block = (...lines: string[]) => `\n\n<follow_ups>\n${lines.join('\n')}\n</follow_ups>`;

describe('splitFollowUps', () => {
  it('leaves a reply without a block alone', () => {
    expect(splitFollowUps('Just an answer.')).toEqual({ body: 'Just an answer.', suggestions: [] });
  });

  it('takes the block off the reply and returns its suggestions, without bullets or quotes', () => {
    const r = splitFollowUps(`An answer.${block('- How does its debt compare with peers?', '2. "Show the last five years of profit"', 'Check my sector exposure')}`);
    expect(r.body).toBe('An answer.');
    expect(r.suggestions).toEqual(['How does its debt compare with peers?', 'Show the last five years of profit', 'Check my sector exposure']);
  });

  it('hides a block that is still streaming, so the markers never flash on screen', () => {
    expect(splitFollowUps('An answer.\n\n<follow_ups>\nHow does its de')).toEqual({ body: 'An answer.', suggestions: [] });
    expect(splitFollowUps('An answer.\n\n<follow_')).toEqual({ body: 'An answer.\n\n<follow_', suggestions: [] });
  });

  it('keeps at most three, drops repeats and too-short or too-long lines', () => {
    const r = splitFollowUps(`A.${block('Compare with TCS', 'compare with tcs', 'ok', 'x'.repeat(91), 'Check sector exposure', 'Open the chart', 'One more question')}`);
    expect(r.suggestions).toEqual(['Compare with TCS', 'Check sector exposure', 'Open the chart']);
  });

  it('needs at least two usable suggestions, but still hides the block', () => {
    expect(splitFollowUps(`A.${block('Only one real question')}`)).toEqual({ body: 'A.', suggestions: [] });
  });
});
