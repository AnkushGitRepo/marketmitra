import { diagnoseEmailSetup, type EmailDiagnosis } from './diagnosis';
import { fetchVerifiedDomains, isEmailConfigured } from './send';

/** Reads the live configuration and (read-only) asks Resend which domains are verified. Never throws. */
export async function getEmailDiagnosis(): Promise<EmailDiagnosis> {
  const configured = isEmailConfigured();
  const domains = configured ? await fetchVerifiedDomains() : { domains: null, error: null };
  return diagnoseEmailSetup({
    apiKeySet: configured,
    from: process.env.ALERT_EMAIL_FROM,
    contactLine: process.env.EMAIL_CONTACT_LINE,
    verifiedDomains: domains.domains,
    domainsError: domains.error,
  });
}
