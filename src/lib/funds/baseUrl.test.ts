import { describe, expect, it } from 'vitest';
import { DEFAULT_DATA_SERVICE_URL, fundsBaseUrl } from './baseUrl';

describe('fundsBaseUrl', () => {
  it('uses FUNDS_API_URL when it is set', () => {
    expect(fundsBaseUrl({ FUNDS_API_URL: 'http://localhost:8420', FUNDAMENTALS_API_URL: 'https://hosted.example' })).toBe(
      'http://localhost:8420',
    );
  });

  it('falls back to FUNDAMENTALS_API_URL so nothing changes for anyone who does not set it', () => {
    expect(fundsBaseUrl({ FUNDAMENTALS_API_URL: 'https://hosted.example' })).toBe('https://hosted.example');
  });

  it('falls back to the local default when neither is set', () => {
    expect(fundsBaseUrl({})).toBe(DEFAULT_DATA_SERVICE_URL);
    expect(DEFAULT_DATA_SERVICE_URL).toBe('http://localhost:8420');
  });

  it.each(['', '   '])('treats an empty or blank FUNDS_API_URL (%j) as unset', (blank) => {
    expect(fundsBaseUrl({ FUNDS_API_URL: blank, FUNDAMENTALS_API_URL: 'https://hosted.example' })).toBe('https://hosted.example');
  });

  it('tolerates a trailing slash and surrounding spaces', () => {
    expect(fundsBaseUrl({ FUNDS_API_URL: ' http://localhost:8420/ ' })).toBe('http://localhost:8420');
    expect(fundsBaseUrl({ FUNDAMENTALS_API_URL: 'https://hosted.example//' })).toBe('https://hosted.example');
  });

  it('reads the environment at call time, not at import time', () => {
    const env: Record<string, string | undefined> = { FUNDAMENTALS_API_URL: 'https://a.example' };
    expect(fundsBaseUrl(env)).toBe('https://a.example');
    env.FUNDS_API_URL = 'https://b.example';
    expect(fundsBaseUrl(env)).toBe('https://b.example');
  });
});
