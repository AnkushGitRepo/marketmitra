import Link from 'next/link';
import type { EmailAlertStatus } from '@/lib/notifications/emailStatus';
import type { NotificationChannelSettingsView } from '@/lib/userSettings';
import rowStyles from '@/app/(app)/settings/Settings.module.css';
import styles from './AlertsSummaryPanel.module.css';

interface AlertsSummaryPanelProps {
  readonly emailStatus: EmailAlertStatus | null;
  readonly guardrailsEnabled: boolean;
  readonly channels: NotificationChannelSettingsView | null;
}

function connectedChannels(view: NotificationChannelSettingsView | null): string[] {
  if (!view) return [];
  return [view.slack.configured && 'Slack', view.telegram.configured && 'Telegram', view.whatsapp.configured && 'WhatsApp', view.webhook.configured && 'Custom webhook'].filter(
    (x): x is string => Boolean(x)
  );
}

function emailLine(status: EmailAlertStatus | null): { text: string; tone: 'ok' | 'warn' | 'off' } {
  if (!status) return { text: 'Unavailable right now', tone: 'warn' };
  if (!status.enabled) return { text: 'Off. Alerts appear in MarketMitra only.', tone: 'off' };
  if (!status.deliverable) return { text: `On, but cannot send: ${status.blockedText ?? 'email is not set up.'}`, tone: 'warn' };
  return { text: `On. Alerts are emailed to ${status.maskedTo ?? 'your account address'}.`, tone: 'ok' };
}

/** A read-only summary of alert delivery. The controls live in one place only, the Alert settings drawer, so the two screens cannot drift. */
export function AlertsSummaryPanel({ emailStatus, guardrailsEnabled, channels }: AlertsSummaryPanelProps) {
  const email = emailLine(emailStatus);
  const connected = connectedChannels(channels);

  return (
    <section className={rowStyles.section} aria-labelledby="alerts-title">
      <h2 id="alerts-title" className={rowStyles.sectionTitle}>
        Alerts &amp; channels
      </h2>
      <p className={rowStyles.sectionIntro}>Where alert notifications go. These are managed in one place, Alert settings on the Alerts page, so there is only ever one copy of each switch.</p>

      <dl className={styles.list}>
        <div className={styles.item}>
          <dt>Email alerts</dt>
          <dd className={styles[email.tone]}>{email.text}</dd>
        </div>
        <div className={styles.item}>
          <dt>Auto-guardrails</dt>
          <dd>{guardrailsEnabled ? 'On. New holdings get a 10% trailing stop and a 15% drawdown watch.' : 'Off. New holdings get no default stop or drawdown alert.'}</dd>
        </div>
        <div className={styles.item}>
          <dt>Other channels</dt>
          <dd>{connected.length > 0 ? `${connected.join(', ')} connected.` : 'None connected. In-app alerts are always on.'}</dd>
        </div>
      </dl>

      <Link className={styles.cta} href="/alerts?settings=1">
        Manage in Alert settings →
      </Link>
    </section>
  );
}
