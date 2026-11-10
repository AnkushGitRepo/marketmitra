import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { isAdminUser } from '@/lib/auth/admin';
import { getCurrentUserId } from '@/lib/currentUserId';
import { renderWelcomeEmail } from '@/lib/welcome/template';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Welcome email preview', robots: { index: false } };

/** Operator-only: shows exactly what new users receive, rendered in a sandboxed frame. Sends nothing. */
export default async function WelcomeEmailPreviewPage() {
  if (!isAdminUser(await getCurrentUserId())) notFound();

  // Use this request's own origin so the logo loads wherever the preview is opened (local, preview, production).
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const mail = renderWelcomeEmail({ name: 'Asha', appUrl: `${proto}://${host}` });

  return (
    <div className={styles.page}>
      <p className={styles.eyebrow}>Operator preview</p>
      <h1 className={styles.title}>Welcome email</h1>
      <p className={styles.note}>
        This is the one-time email new users get. Subject: <strong>{mail.subject}</strong>. Nothing is sent from this page; the name below is a sample.
      </p>
      <iframe title="Welcome email preview" srcDoc={mail.html} sandbox="" className={styles.frame} />
      <details className={styles.details}>
        <summary>Plain-text version</summary>
        <pre className={styles.text}>{mail.text}</pre>
      </details>
    </div>
  );
}
