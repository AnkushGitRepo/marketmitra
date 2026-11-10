import type { SendResult } from '@/lib/email/send';
import { SAMPLE_EMAILS } from './samples';

export interface TestSendResult {
  readonly id: string;
  readonly label: string;
  readonly ok: boolean;
  /** The provider's own error text when it failed, shown to the admin verbatim. */
  readonly error?: string;
}

export interface TestSendDeps {
  readonly send: (email: { to: string; subject: string; html: string; text: string }) => Promise<SendResult>;
}

export const TEST_SUBJECT_PREFIX = '[TEST] ';

/** Which sample emails an id refers to: one, or all of them. Unknown ids are reported, never silently skipped. */
export function selectSamples(id: string) {
  if (id === 'all') return SAMPLE_EMAILS;
  return SAMPLE_EMAILS.filter((e) => e.id === id);
}

/**
 * Sends the chosen sample emails, one at a time, to one address (the admin's own). Subjects are prefixed so a test is
 * never mistaken for the real thing. Never throws.
 */
export async function sendTestEmails(id: string, to: string, appUrl: string, deps: TestSendDeps): Promise<TestSendResult[]> {
  const samples = selectSamples(id);
  if (samples.length === 0) return [{ id, label: id, ok: false, error: 'Unknown email id' }];

  const results: TestSendResult[] = [];
  for (const sample of samples) {
    try {
      const mail = sample.build(appUrl);
      const sent = await deps.send({ to, subject: `${TEST_SUBJECT_PREFIX}${mail.subject}`, html: mail.html, text: mail.text });
      results.push(sent.ok ? { id: sample.id, label: sample.label, ok: true } : { id: sample.id, label: sample.label, ok: false, error: sent.error });
    } catch (e) {
      results.push({ id: sample.id, label: sample.label, ok: false, error: e instanceof Error ? e.message : 'unexpected error' });
    }
  }
  return results;
}
