/** Optional Reply-To for every email we send (`EMAIL_REPLY_TO`), so replies reach a monitored inbox rather than the send-only sender. */

// One address, optionally as `Name <address>`. No commas, angle-bracket nesting or control characters, so a bad value is
// ignored instead of being passed through to a mail header.
const ADDRESS = /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/;
const NAMED = /^[^<>\r\n,;]+<([^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+)>$/;

export function parseReplyTo(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return ADDRESS.test(trimmed) || NAMED.test(trimmed) ? trimmed : undefined;
}

export function replyToFromEnv(): string | undefined {
  return parseReplyTo(process.env.EMAIL_REPLY_TO);
}
