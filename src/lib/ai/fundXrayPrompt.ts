// The prompt for the Fund X-Ray write-up (#274). Pure: the findings are computed in `lib/funds/xray`, so
// the model words numbers it is given instead of inventing any.

import type { XrayFacts } from '@/lib/funds/xray';
import { untrusted, wrapUntrusted } from './untrusted';

const MAX_NAME_CHARS = 120;
const MAX_FINDING_CHARS = 600;

export function buildFundXrayPrompt(fundName: string, facts: XrayFacts): string {
  // The fund name comes from AMFI's list: external text, so it is fenced like any other.
  const name = wrapUntrusted([untrusted(fundName, MAX_NAME_CHARS)], MAX_NAME_CHARS);
  // The findings are built from our numbers but also name the user's own holdings (symbols they typed), so they are fenced too.
  const findings = facts.items.map((item) => `${item.key.toUpperCase()}: ${untrusted(item.text, MAX_FINDING_CHARS)} (tone: ${item.tone})`);
  return [`FUND:\n${name}`, `FINDINGS:\n<untrusted>\n${findings.join('\n')}\n</untrusted>`].join('\n');
}
