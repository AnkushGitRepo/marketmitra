import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { isAdminUser } from '@/lib/auth/admin';
import { getCurrentUserId } from '@/lib/currentUserId';
import { SAMPLE_EMAILS } from '@/emails/samples';
import { getEmailDiagnosis } from '@/lib/email/status';
import { EmailTestControls } from './EmailTestControls';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Email designs', robots: { index: false } };

const GROUPS = ['Onboarding', 'Alerts', 'Updates', 'Account'] as const;
const WIDTHS = { desktop: 680, mobile: 375 } as const;

interface Props {
  searchParams: Promise<{ id?: string; w?: string }>;
}

/** Operator-only gallery of the designed emails with sample data. Sends nothing. */
export default async function EmailGalleryPage({ searchParams }: Props) {
  if (!isAdminUser(await getCurrentUserId())) notFound();

  const { id, w } = await searchParams;
  const selected = SAMPLE_EMAILS.find((e) => e.id === id) ?? SAMPLE_EMAILS[0];
  const width = w === 'mobile' ? 'mobile' : 'desktop';

  // This request's own origin, so the images load wherever the gallery is opened (local, preview, production).
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const mail = selected.build(`${proto}://${host}`);
  const diagnosis = await getEmailDiagnosis();

  const href = (nextId: string, nextWidth: string) => `/system/emails?id=${nextId}&w=${nextWidth}`;

  return (
    <div className={styles.page}>
      <p className={styles.eyebrow}>Operator preview</p>
      <h1 className={styles.title}>Email designs</h1>
      <p className={styles.note}>
        Every email in the design system, rendered with <strong>sample data</strong>. Nothing is sent unless you press a Send button, and those go only to your own address. Dark mode follows your device setting.
      </p>

      <section className={`${styles.status} ${styles[`status_${diagnosis.status}`]}`} aria-label="Email delivery status">
        <p className={styles.statusTitle}>
          {diagnosis.status === 'ok' ? '✓' : diagnosis.status === 'warning' ? '!' : '✗'} {diagnosis.summary}
        </p>
        <p className={styles.statusMeta}>
          Sending as <strong>{diagnosis.sender}</strong>
          {diagnosis.verifiedDomains && <> · verified in Resend: {diagnosis.verifiedDomains.length > 0 ? diagnosis.verifiedDomains.join(', ') : 'none'}</>}
        </p>
        {diagnosis.issues.length > 0 && (
          <ul className={styles.statusList}>
            {diagnosis.issues.map((i) => (
              <li key={i.message} className={styles[`issue_${i.severity}`]}>{i.message}</li>
            ))}
          </ul>
        )}
      </section>

      <div className={styles.layout}>
        <nav className={styles.list} aria-label="Emails">
          {GROUPS.map((group) => (
            <section key={group}>
              <h2 className={styles.group}>{group}</h2>
              <ul>
                {SAMPLE_EMAILS.filter((e) => e.group === group).map((e) => (
                  <li key={e.id}>
                    <Link href={href(e.id, width)} className={`${styles.item} ${e.id === selected.id ? styles.itemActive : ''}`} aria-current={e.id === selected.id ? 'page' : undefined}>
                      {e.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>

        <div className={styles.stage}>
          <div className={styles.bar}>
            <div>
              <p className={styles.subject}>{mail.subject}</p>
              <p className={styles.hint}>{selected.note}</p>
            </div>
            <div className={styles.toggle} role="group" aria-label="Preview width">
              {(['desktop', 'mobile'] as const).map((k) => (
                <Link key={k} href={href(selected.id, k)} className={`${styles.toggleBtn} ${width === k ? styles.toggleActive : ''}`} aria-pressed={width === k}>
                  {k === 'desktop' ? 'Desktop' : 'Mobile'}
                </Link>
              ))}
            </div>
          </div>
          <EmailTestControls selectedId={selected.id} selectedLabel={selected.label} />
          <iframe title={`${selected.label} preview`} srcDoc={mail.html} sandbox="" className={styles.frame} style={{ width: WIDTHS[width] }} />
          <details className={styles.details}>
            <summary>Plain-text version</summary>
            <pre className={styles.text}>{mail.text}</pre>
          </details>
        </div>
      </div>
    </div>
  );
}
