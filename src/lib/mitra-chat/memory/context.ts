import { untrusted } from '@/lib/ai/untrusted';
import { memoryContext } from './rules';
import { liveMemoryStore, type MemoryStore } from './store';

/** The memory block for the system prompt; '' when there are none or they cannot be read (Mitra then answers as before). Never throws. */
export async function buildMemoryContext(userId: string, store: MemoryStore = liveMemoryStore): Promise<string> {
  try {
    return memoryContext(await store.list(userId), untrusted);
  } catch {
    return '';
  }
}
