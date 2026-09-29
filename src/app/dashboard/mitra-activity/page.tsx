import { getCurrentUserId } from '@/lib/currentUserId';
import { listMitraActions, type MitraAction } from '@/lib/mitra/activityLog';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

const ACTION_LABELS: Record<MitraAction['action'], string> = {
  alert_created: 'Created',
  alert_updated: 'Updated',
  alert_paused: 'Paused',
  alert_resumed: 'Resumed',
};

const SOURCE_LABELS: Record<MitraAction['source'], string> = {
  auto_guardrail: 'default guardrail',
  mitra: 'Mitra, on its own',
};

function relativeTime(value: Date): string {
  const secs = Math.round((Date.now() - value.getTime()) / 1000);
  if (secs < 45) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return value.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function DiffValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <p className={styles.diffValue}>—</p>;
  return <p className={styles.diffValue}>{JSON.stringify(value, null, 0)}</p>;
}

export default async function MitraActivityPage() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return (
      <div className={styles.pageRoot}>
        <p className={styles.introNote}>Sign in to see Mitra&rsquo;s activity.</p>
      </div>
    );
  }

  let actions: MitraAction[] = [];
  try {
    actions = await listMitraActions(userId);
  } catch {
    // Mongo unreachable — render the shell with an empty list rather than 500.
  }

  return (
    <div className={styles.pageRoot}>
      <p className={styles.eyebrow}>Mitra activity</p>
      <h1 className={styles.h1}>What Mitra has done</h1>
      <p className={styles.introNote}>
        Every alert Mitra has created or changed on its own — whether a default guardrail set up
        automatically on a new holding, or something it decided on its own judgment in chat — with the
        reason it gave. Nothing here was done by you directly; your own edits from the{' '}
        <a href="/dashboard/alerts">Alerts page</a> don&rsquo;t appear here. Change or undo anything below
        from that page at any time.
      </p>

      {actions.length === 0 ? (
        <div className={styles.empty}>Mitra hasn&rsquo;t created or changed any alerts yet.</div>
      ) : (
        <div className={styles.list}>
          {actions.map((a) => (
            <div key={a.id} className={styles.row}>
              <div className={styles.rowHead}>
                <div className={styles.rowLeft}>
                  <span className={`${styles.badge} ${styles[`badge_${a.action}`]}`}>
                    {ACTION_LABELS[a.action]}
                  </span>
                  {a.symbol && (
                    <a href={`/dashboard/stock/${encodeURIComponent(a.symbol)}`} className={styles.symbolLink}>
                      {a.symbol}
                    </a>
                  )}
                  <span className={styles.sourceTag}>— {SOURCE_LABELS[a.source]}</span>
                </div>
                <span className={styles.timestamp}>{relativeTime(a.createdAt)}</span>
              </div>

              <p className={styles.reason}>{a.reason}</p>

              {(a.before || a.after) && (
                <div className={styles.diff}>
                  <div className={styles.diffCol}>
                    <p className={styles.diffLabel}>Before</p>
                    <DiffValue value={a.before} />
                  </div>
                  <div className={styles.diffCol}>
                    <p className={styles.diffLabel}>After</p>
                    <DiffValue value={a.after} />
                  </div>
                </div>
              )}

              {a.alertId && (
                <div className={styles.rowActions}>
                  <a href={`/dashboard/alerts?symbol=${encodeURIComponent(a.symbol ?? '')}`} className={styles.editLink}>
                    View / change this alert →
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
