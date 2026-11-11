import { beforeEach, describe, expect, it, vi } from 'vitest';

// The driver is replaced so a connect can be made to fail on demand.
const connects: Array<() => Promise<unknown>> = [];
let created = 0;
vi.mock('mongodb', () => ({
  MongoClient: class {
    constructor() {
      created += 1;
    }
    connect() {
      const next = connects.shift();
      return next ? next() : Promise.resolve(this);
    }
    db(name: string) {
      return { name };
    }
    close() {
      return Promise.resolve();
    }
  },
}));

const load = async () => {
  vi.resetModules();
  process.env.MONGODB_URI = 'mongodb://example';
  process.env.MONGODB_DB = 'marketmitra';
  delete (globalThis as { _mongoClientPromise?: unknown })._mongoClientPromise;
  return import('./mongodb');
};
const failing = () => Promise.reject(new Error('Server selection timed out after 5000 ms'));

beforeEach(() => {
  connects.length = 0;
  created = 0;
});

describe('getDb', () => {
  it('does not connect at import time, so a failure there can never be an unhandled rejection', async () => {
    connects.push(failing);
    await load();
    expect(created).toBe(0);
  });
  it('reuses one connection across calls', async () => {
    const { getDb } = await load();
    await getDb();
    await getDb();
    expect(created).toBe(1);
  });
  it('retries once after a failed connect instead of keeping the failure', async () => {
    connects.push(failing);
    const { getDb } = await load();
    await expect(getDb()).resolves.toMatchObject({ name: 'marketmitra' });
    expect(created).toBe(2);
  });
  it('rejects when the retry also fails, but the next call connects again (a rejected promise is never cached)', async () => {
    connects.push(failing, failing);
    const { getDb } = await load();
    await expect(getDb()).rejects.toThrow(/Server selection timed out/);
    await expect(getDb()).resolves.toMatchObject({ name: 'marketmitra' });
  });
});
