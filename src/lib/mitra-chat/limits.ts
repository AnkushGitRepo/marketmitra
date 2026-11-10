// Limits for the full-page Mitra chat (ADR 0036). One file so the API, the UI
// and the tests agree. Per-file size stays under Vercel's 4.5 MB request-body
// cap (multipart overhead included) so hosted and self-host behave the same.

export const MAX_FILE_BYTES = 4_000_000;
export const MAX_FILES_PER_MESSAGE = 6;
export const MAX_USER_STORAGE_BYTES = 50_000_000;

export const MAX_CONVERSATIONS_PER_USER = 200;
export const MAX_MESSAGES_PER_CONVERSATION = 2000;
export const MAX_MESSAGE_CHARS = 8000;
export const TITLE_MAX = 80;
export const DEFAULT_TITLE = 'New chat';

// Context window sent to the model: the newest messages that fit both caps;
// anything older is folded into a stored running summary.
export const CONTEXT_MAX_MESSAGES = 30;
export const CONTEXT_MAX_CHARS = 60_000;
export const SUMMARY_MAX_CHARS = 3000;

// Raw attachment bytes are only re-sent for the newest user messages that carry
// files, within a byte budget; older attachments become a short placeholder.
export const INLINE_ATTACHMENT_MESSAGES = 3;
export const INLINE_ATTACHMENT_BYTE_BUDGET = 10_000_000;
export const INLINE_TEXT_FILE_CHARS = 20_000;

export const FILE_URL_PREFIX = '/api/mitra/files/';
