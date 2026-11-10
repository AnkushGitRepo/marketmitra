import type { UIMessage } from 'ai';
import type { AttachmentKind } from '@/lib/mitra-chat/attachments';

export interface ConversationDto {
  readonly id: string;
  readonly title: string;
  readonly titleSource: 'auto' | 'user';
  readonly messageCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface UploadedFile {
  readonly id: string;
  readonly url: string;
  readonly filename: string;
  readonly mediaType: string;
  readonly kind: AttachmentKind;
  readonly size: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError('Network error. Check your connection and try again.', 0);
  }
  const json = (await res.json().catch(() => null)) as { success?: boolean; data?: T; error?: string } | null;
  if (!res.ok || !json?.success) throw new ApiError(json?.error ?? 'Something went wrong. Please try again.', res.status);
  return json.data as T;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export const mitraApi = {
  list: (q?: string) => request<ConversationDto[]>(`/api/mitra/conversations${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  create: (title?: string) => request<ConversationDto>('/api/mitra/conversations', jsonInit('POST', title ? { title } : {})),
  get: (id: string) => request<{ conversation: ConversationDto; messages: UIMessage[] }>(`/api/mitra/conversations/${id}`),
  rename: (id: string, title: string) => request<ConversationDto>(`/api/mitra/conversations/${id}`, jsonInit('PATCH', { title })),
  remove: (id: string) => request<{ removed: boolean }>(`/api/mitra/conversations/${id}`, { method: 'DELETE' }),
  upload: (conversationId: string, file: File) => {
    const form = new FormData();
    form.set('file', file);
    form.set('conversationId', conversationId);
    return request<UploadedFile>('/api/mitra/files', { method: 'POST', body: form });
  },
  removeFile: (id: string) => request<{ removed: boolean }>(`/api/mitra/files/${id}`, { method: 'DELETE' }),
};

/** Maps a failed chat request to a message the user can act on. */
export function chatErrorMessage(error: Error): { text: string; needsKey: boolean } {
  let body: { error?: string; hint?: string } | null = null;
  try {
    body = JSON.parse(error.message);
  } catch {
    body = null;
  }
  if (body?.error === 'no_ai_key') return { text: 'Add your AI provider key in Settings to chat with Mitra.', needsKey: true };
  if (body?.error === 'attachment_unsupported' && body.hint) return { text: body.hint, needsKey: false };
  if (body?.error) return { text: body.error, needsKey: false };
  return { text: 'Mitra could not answer just now. Try again in a moment.', needsKey: false };
}
