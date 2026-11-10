import { describe, expect, it } from 'vitest';
import { sniffAttachment, supportsKind, unsupportedReason } from './attachments';

const bytes = (...n: number[]) => new Uint8Array(n);
const text = (s: string) => new TextEncoder().encode(s);
const padded = (head: Uint8Array, len = 16) => {
  const out = new Uint8Array(len);
  out.set(head);
  return out;
};

describe('sniffAttachment', () => {
  it('identifies images by magic bytes', () => {
    expect(sniffAttachment(padded(bytes(0x89, 0x50, 0x4e, 0x47)), 'a.png')?.mediaType).toBe('image/png');
    expect(sniffAttachment(padded(bytes(0xff, 0xd8, 0xff, 0xe0)), 'a.jpg')?.mediaType).toBe('image/jpeg');
    expect(sniffAttachment(padded(text('GIF89a')), 'a.gif')?.mediaType).toBe('image/gif');
    expect(sniffAttachment(padded(text('RIFF....WEBP')), 'a.webp')?.mediaType).toBe('image/webp');
  });

  it('identifies PDF and audio', () => {
    expect(sniffAttachment(padded(text('%PDF-1.7')), 'r.pdf')).toEqual({ mediaType: 'application/pdf', kind: 'pdf' });
    expect(sniffAttachment(padded(text('RIFF....WAVE')), 'a.wav')?.kind).toBe('audio');
    expect(sniffAttachment(padded(text('ID3')), 'a.mp3')?.mediaType).toBe('audio/mpeg');
    expect(sniffAttachment(padded(bytes(0xff, 0xfb, 0x90)), 'a.mp3')?.mediaType).toBe('audio/mpeg');
    expect(sniffAttachment(padded(text('OggS')), 'a.ogg')?.mediaType).toBe('audio/ogg');
    expect(sniffAttachment(padded(text('fLaC')), 'a.flac')?.mediaType).toBe('audio/flac');
    expect(sniffAttachment(padded(new Uint8Array([0, 0, 0, 0x20, ...text('ftypM4A ')])), 'a.m4a')?.mediaType).toBe('audio/mp4');
  });

  it('accepts webm only as audio by extension', () => {
    const webm = padded(bytes(0x1a, 0x45, 0xdf, 0xa3));
    expect(sniffAttachment(webm, 'clip.webm')?.mediaType).toBe('audio/webm');
    expect(sniffAttachment(webm, 'clip.mp4')).toBeNull();
  });

  it('trusts bytes over the filename', () => {
    expect(sniffAttachment(padded(text('%PDF-1.7')), 'photo.png')?.kind).toBe('pdf');
    expect(sniffAttachment(text('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'x.png')).toBeNull();
  });

  it('accepts plain UTF-8 text files and rejects binary dressed as text', () => {
    expect(sniffAttachment(text('a,b\n1,2'), 'data.csv')).toEqual({ mediaType: 'text/csv', kind: 'text' });
    expect(sniffAttachment(text('# notes'), 'n.md')?.mediaType).toBe('text/markdown');
    expect(sniffAttachment(bytes(0x68, 0x00, 0x69), 'x.txt')).toBeNull();
    expect(sniffAttachment(bytes(0xff, 0xfe, 0xfd), 'x.txt')).toBeNull();
    expect(sniffAttachment(new Uint8Array(0), 'x.txt')).toBeNull();
  });

  it('rejects HTML, executables and unknown types', () => {
    expect(sniffAttachment(text('<html><script>'), 'a.html')).toBeNull();
    expect(sniffAttachment(text('MZ......'), 'a.exe')).toBeNull();
  });
});

describe('supportsKind / unsupportedReason', () => {
  it('lets every provider read images, PDFs and text', () => {
    for (const provider of ['gemini', 'anthropic', 'openrouter'] as const) {
      for (const kind of ['image', 'pdf', 'text'] as const) expect(supportsKind({ provider }, kind)).toBe(true);
    }
  });

  it('allows audio on Gemini, blocks it on Claude, and checks the OpenRouter route', () => {
    expect(supportsKind({ provider: 'gemini' }, 'audio')).toBe(true);
    expect(supportsKind({ provider: 'anthropic' }, 'audio')).toBe(false);
    expect(supportsKind({ provider: 'openrouter', model: 'google/gemini-3.8-flash' }, 'audio')).toBe(true);
    expect(supportsKind({ provider: 'openrouter', model: 'anthropic/claude-haiku-5.5' }, 'audio')).toBe(false);
  });

  it('explains an unsupported attachment, otherwise returns null', () => {
    expect(unsupportedReason({ provider: 'anthropic' }, ['image', 'audio'])).toMatch(/audio/);
    expect(unsupportedReason({ provider: 'anthropic' }, ['image'])).toBeNull();
  });
});
