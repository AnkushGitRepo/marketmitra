import { describe, expect, it } from 'vitest';
import { detectBrowser, micGuidance, problemForMediaError, problemForSpeechError } from './guidance';

const UA = {
  chrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  safari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  firefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0',
};

describe('detectBrowser', () => {
  it('tells Chrome, Edge, Safari and Firefox apart (Edge and Chrome both say "Chrome")', () => {
    expect(detectBrowser(UA.chrome)).toBe('chrome');
    expect(detectBrowser(UA.edge)).toBe('edge');
    expect(detectBrowser(UA.safari)).toBe('safari');
    expect(detectBrowser(UA.firefox)).toBe('firefox');
  });

  it('takes Brave from the explicit flag, since its user agent looks like Chrome', () => {
    expect(detectBrowser(UA.chrome, true)).toBe('brave');
    expect(detectBrowser('curl/8')).toBe('other');
  });
});

describe('problem mapping', () => {
  it('treats not-allowed and service-not-allowed as a permission problem', () => {
    expect(problemForSpeechError('not-allowed', 'chrome')).toBe('denied');
    expect(problemForSpeechError('service-not-allowed', 'safari')).toBe('denied');
  });

  it('maps a missing device, and Brave\'s network failure to "speech unavailable"', () => {
    expect(problemForSpeechError('audio-capture', 'chrome')).toBe('no-device');
    expect(problemForSpeechError('network', 'brave')).toBe('speech-unavailable');
    expect(problemForSpeechError('network', 'chrome')).toBeNull();
    expect(problemForSpeechError('no-speech', 'chrome')).toBeNull();
  });

  it('maps getUserMedia errors', () => {
    expect(problemForMediaError('NotFoundError')).toBe('no-device');
    expect(problemForMediaError('NotAllowedError')).toBe('denied');
    expect(problemForMediaError('SecurityError')).toBe('denied');
  });
});

describe('micGuidance', () => {
  it('gives address-bar steps for Chrome and a padlock/permissions path for Edge', () => {
    expect(micGuidance('denied', 'chrome').steps.join(' ')).toMatch(/address bar/);
    expect(micGuidance('denied', 'edge').steps.join(' ')).toMatch(/padlock/);
    expect(micGuidance('denied', 'chrome').canRetry).toBe(true);
  });

  it('gives the Safari menu path and mentions the OS-level block for every denied case', () => {
    expect(micGuidance('denied', 'safari').steps.join(' ')).toMatch(/Safari > Settings for This Website/);
    for (const b of ['chrome', 'edge', 'brave', 'safari', 'other'] as const) {
      expect(micGuidance('denied', b).steps.join(' ')).toMatch(/Privacy/);
    }
  });

  it('warns Brave users that speech-to-text may be missing', () => {
    expect(micGuidance('denied', 'brave').steps.join(' ')).toMatch(/Brave may not provide speech-to-text/);
    expect(micGuidance('speech-unavailable', 'brave').title).toMatch(/Brave/);
    expect(micGuidance('speech-unavailable', 'brave').canRetry).toBe(false);
  });

  it('explains insecure contexts without offering a retry', () => {
    const g = micGuidance('insecure', 'chrome');
    expect(g.steps.join(' ')).toMatch(/https/);
    expect(g.canRetry).toBe(false);
  });

  it('every guidance has a title and at least two steps', () => {
    for (const p of ['denied', 'insecure', 'no-device', 'speech-unavailable'] as const) {
      for (const b of ['chrome', 'edge', 'brave', 'safari', 'firefox', 'other'] as const) {
        const g = micGuidance(p, b);
        expect(g.title.length).toBeGreaterThan(5);
        expect(g.steps.length).toBeGreaterThanOrEqual(2);
      }
    }
  });
});
