import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getNews } from './newsApi';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ items: [], next_cursor: null }) }) as Response));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const urlOf = () => String(vi.mocked(fetch).mock.calls[0][0]);

describe('getNews', () => {
  it('leaves regulator notices out unless asked (the news page)', async () => {
    await getNews({ limit: 10 });
    expect(urlOf()).not.toContain('include_regulatory');
  });

  it('asks for regulator notices when the retrieval indexer wants them (#365)', async () => {
    await getNews({ limit: 10, includeRegulatory: true });
    expect(urlOf()).toContain('include_regulatory=true');
  });
});
