import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/currentUserId', () => ({ getCurrentUserId: async () => 'u1' }));
const createWishlist = vi.fn(async (_u: string, name: string) => ({ id: 'a', name, symbols: [] }));
const renameWishlist = vi.fn(async (_u: string, _id: string, name: string) => ({ id: 'a', name, symbols: [] }));
vi.mock('@/lib/wishlists/userWishlists', () => ({
  MAX_NAME: 60,
  listWishlists: vi.fn(async () => []),
  createWishlist,
  renameWishlist,
  deleteWishlist: vi.fn(),
}));

const { POST } = await import('./route');
const { PATCH } = await import('./[id]/route');

const post = (name: string) => POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ name }) }));
const patch = (name: string) => PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify({ name }) }), { params: Promise.resolve({ id: 'a' }) });

beforeEach(() => vi.clearAllMocks());

describe('watchlist names: Holdings is reserved', () => {
  it('creates an ordinary list', async () => {
    expect((await post('Banks')).status).toBe(201);
  });
  it('refuses to create or rename a list to Holdings, in any casing', async () => {
    for (const name of ['Holdings', ' holdings ', 'HOLDINGS']) {
      expect((await post(name)).status).toBe(422);
      expect((await patch(name)).status).toBe(422);
    }
    expect(createWishlist).not.toHaveBeenCalled();
    expect(renameWishlist).not.toHaveBeenCalled();
  });
  it('still allows names that merely contain the word', async () => {
    expect((await post('My holdings')).status).toBe(201);
  });
});
