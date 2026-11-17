// A short, scannable preview of a notification body for the bell dropdown. Bodies such as the morning brief are multi-line
// (headings and "- SYMBOL: text" bullets); rendered as plain text the newlines collapse into one unreadable paragraph.

export const PREVIEW_MAX_LINES = 4;
export const PREVIEW_MAX_CHARS = 90;

export interface NotificationPreview {
  lines: string[];
  /** How many further non-empty lines the body has beyond the preview. */
  hidden: number;
}

const clipLine = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

export function previewNotificationBody(body: string, maxLines = PREVIEW_MAX_LINES, maxChars = PREVIEW_MAX_CHARS): NotificationPreview {
  const all = body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => (l.startsWith('- ') ? `• ${l.slice(2)}` : l));
  return { lines: all.slice(0, maxLines).map((l) => clipLine(l, maxChars)), hidden: Math.max(0, all.length - maxLines) };
}
