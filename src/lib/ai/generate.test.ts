import { describe, expect, it } from 'vitest';
import { normalizeAiError } from './generate';

describe('normalizeAiError', () => {
  it('buckets an invalid-key error and echoes the provider text', () => {
    const out = normalizeAiError(new Error('API key not valid. Please pass a valid API key.'));
    expect(out).toMatch(/API key was rejected/);
    expect(out).toMatch(/provider said: .*API key not valid/);
  });

  it('buckets a model-not-found error', () => {
    const out = normalizeAiError(
      new Error('models/gemini-2.5-flash is not found for API version v1beta')
    );
    expect(out).toMatch(/could not find that model/);
    expect(out).toMatch(/provider said:/);
  });

  it('buckets a rate-limit error', () => {
    expect(normalizeAiError(new Error('429 RESOURCE_EXHAUSTED'))).toMatch(/rate-limit \/ quota/);
  });

  it('buckets an overload error, not a model-not-found error, even though the message contains "model"', () => {
    const out = normalizeAiError(
      new Error(
        'This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.'
      )
    );
    expect(out).toMatch(/temporarily overloaded/);
    expect(out).not.toMatch(/could not find that model/);
  });

  it('reads responseBody + statusCode off an APICallError-shaped object', () => {
    const out = normalizeAiError({
      message: 'Not Found',
      statusCode: 404,
      responseBody: '{"error":{"message":"model xyz not found"}}',
    });
    expect(out).toMatch(/could not find that model/);
    expect(out).toMatch(/model xyz not found/);
  });

  it('falls back to a generic message with no detail', () => {
    expect(normalizeAiError(undefined)).toBe('The AI request failed.');
  });
});
