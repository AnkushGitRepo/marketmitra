import type { AiProvider } from '@/lib/userSettings';

export type AttachmentKind = 'image' | 'pdf' | 'audio' | 'text';

export interface SniffedAttachment {
  readonly mediaType: string;
  readonly kind: AttachmentKind;
}

const ascii = (bytes: Uint8Array, start: number, text: string): boolean =>
  text.length + start <= bytes.length && [...text].every((c, i) => bytes[start + i] === c.charCodeAt(0));

const ext = (filename: string): string => filename.toLowerCase().split('.').pop() ?? '';

/** A valid MPEG audio frame header (sync + non-reserved version/layer/bitrate/sample-rate). */
function isMp3Frame(bytes: Uint8Array): boolean {
  if (bytes.length < 3 || bytes[0] !== 0xff || (bytes[1] & 0xe0) !== 0xe0) return false;
  const version = (bytes[1] >> 3) & 3;
  const layer = (bytes[1] >> 1) & 3;
  const bitrate = bytes[2] >> 4;
  const sampleRate = (bytes[2] >> 2) & 3;
  return version !== 1 && layer !== 0 && bitrate !== 0xf && sampleRate !== 3;
}

function isUtf8Text(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  const head = bytes.subarray(0, 8192);
  if (head.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

/**
 * Decides what a file really is from its bytes — the declared MIME type and
 * extension are attacker-controlled, so they only break ties (text flavour,
 * m4a/webm audio). Returns null for anything outside the allow-list, which
 * deliberately excludes SVG/HTML (script carriers) and video.
 */
export function sniffAttachment(bytes: Uint8Array, filename: string): SniffedAttachment | null {
  const e = ext(filename);
  if (bytes.length >= 4 && bytes[0] === 0x89 && ascii(bytes, 1, 'PNG')) return { mediaType: 'image/png', kind: 'image' };
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mediaType: 'image/jpeg', kind: 'image' };
  if (ascii(bytes, 0, 'GIF8')) return { mediaType: 'image/gif', kind: 'image' };
  if (ascii(bytes, 0, 'RIFF') && ascii(bytes, 8, 'WEBP')) return { mediaType: 'image/webp', kind: 'image' };
  if (ascii(bytes, 0, '%PDF-')) return { mediaType: 'application/pdf', kind: 'pdf' };
  if (ascii(bytes, 0, 'RIFF') && ascii(bytes, 8, 'WAVE')) return { mediaType: 'audio/wav', kind: 'audio' };
  if (ascii(bytes, 0, 'OggS')) return { mediaType: 'audio/ogg', kind: 'audio' };
  if (ascii(bytes, 0, 'fLaC')) return { mediaType: 'audio/flac', kind: 'audio' };
  if (ascii(bytes, 0, 'ID3') || isMp3Frame(bytes)) {
    return { mediaType: 'audio/mpeg', kind: 'audio' };
  }
  if (ascii(bytes, 4, 'ftyp') && ascii(bytes, 8, 'M4A ')) return { mediaType: 'audio/mp4', kind: 'audio' };
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return ['webm', 'weba', 'mka'].includes(e) ? { mediaType: 'audio/webm', kind: 'audio' } : null;
  }
  if (['txt', 'csv', 'md'].includes(e) && isUtf8Text(bytes)) {
    const mediaType = e === 'csv' ? 'text/csv' : e === 'md' ? 'text/markdown' : 'text/plain';
    return { mediaType, kind: 'text' };
  }
  return null;
}

export interface ModelRef {
  readonly provider: AiProvider;
  readonly model?: string;
}

/** Whether the configured model can natively read this kind of attachment. */
export function supportsKind(ref: ModelRef, kind: AttachmentKind): boolean {
  if (kind === 'text' || kind === 'image' || kind === 'pdf') return true;
  // Audio: Gemini reads it; Claude does not; OpenRouter only for Gemini routes.
  if (ref.provider === 'gemini') return true;
  if (ref.provider === 'openrouter') return /gemini/i.test(ref.model ?? 'google/gemini');
  return false;
}

/** A user-facing reason when any attached kind is unreadable, else null. */
export function unsupportedReason(ref: ModelRef, kinds: readonly AttachmentKind[]): string | null {
  if (kinds.some((k) => !supportsKind(ref, k))) {
    return 'The model on your key cannot listen to audio. Switch to a Gemini model in Settings, or attach a transcript instead.';
  }
  return null;
}
