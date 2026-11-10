import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseReplyTo, replyToFromEnv } from './replyTo';

describe('parseReplyTo', () => {
  it('accepts a plain address and trims it', () => {
    expect(parseReplyTo('  support@example.com ')).toBe('support@example.com');
  });

  it('accepts a display-name form', () => {
    expect(parseReplyTo('MarketMitra <support@example.com>')).toBe('MarketMitra <support@example.com>');
  });

  it.each([undefined, '', '   ', 'not-an-email', 'a@b', 'two@example.com, other@example.com', 'x@example.com\nBcc: y@z.com'])(
    'rejects %j so a bad setting never breaks sending or injects a header',
    (value) => {
      expect(parseReplyTo(value)).toBeUndefined();
    }
  );
});

describe('replyToFromEnv', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('reads EMAIL_REPLY_TO', () => {
    vi.stubEnv('EMAIL_REPLY_TO', 'me@example.com');
    expect(replyToFromEnv()).toBe('me@example.com');
  });

  it('is undefined when unset', () => {
    vi.stubEnv('EMAIL_REPLY_TO', '');
    expect(replyToFromEnv()).toBeUndefined();
  });
});
