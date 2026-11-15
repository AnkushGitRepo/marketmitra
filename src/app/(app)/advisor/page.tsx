import Link from 'next/link';
import { advisorPageUser } from '@/lib/advisor/pageGuard';
import { loadOverview } from '@/lib/advisor/diagnostics/overview';
import { PROFILES, PROFILE_IDS, parseProfile, policyFromProfile } from '@/lib/advisor/diagnostics/profiles';
import { DEFAULT_POLICY } from '@/lib/advisor/policy/schema';
import { getPolicy } from '@/lib/advisor/policy/store';
import { DeploymentSimulator } from '@/components/advisor/DeploymentSimulator';
import { FitChecker } from '@/components/advisor/FitChecker';
import { LimitBars } from '@/components/advisor/LimitBars';
import { RulesDrawer } from '@/components/advisor/RulesDrawer';
import { DecisionTracker } from '@/components/advisor/DecisionTracker';
import styles from '@/components/advisor/advisor.module.css';

export const dynamic = 'force-dynamic';

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

const TOOLS = [
  { href: '/advisor/screen', label: 'Screen a company' },
  { href: '/advisor/research', label: 'Cited research memo' },
  { href: '/advisor/journal', label: 'Manual journal' },
  { href: '/advisor/performance', label: 'Paper performance' },
] as const;

export default async function AdvisorPage({ searchParams }: { searchParams: Promise<{ profile?: string }> }) {
  const userId = await advisorPageUser();
  if (!userId) return null;
  const profile = parseProfile((await searchParams).profile);

  const [overview, saved] = await Promise.all([
    loadOverview(userId, profile).catch(() => null),
    getPolicy(userId).catch(() => null),
  ]);
  if (!overview) {
    return (
      <div className={styles.card}>
        <h1 className={styles.h1}>Advisor</h1>
        <p className={styles.error} role="alert">Could not load your holdings. Reload the page to try again.</p>
      </div>
    );
  }

  const { rules, audit, drawdowns, tracker, holdings } = overview;
  const usingPreset = rules.source === 'preset';

  return (
    <>
      <div className={styles.headRow}>
        <div>
          <p className={styles.eyebrow}>Advisor · {usingPreset ? PROFILES[profile].label : 'Your saved rules'}</p>
          <h1 className={styles.h1}>Your portfolio against your own limits</h1>
        </div>
        <div className={styles.formActions}>
          <RulesDrawer initial={saved ?? policyFromProfile(profile, DEFAULT_POLICY)} hasSaved={saved !== null} />
        </div>
      </div>

      {usingPreset && (
        <nav className={styles.presetRow} aria-label="Profile">
          <span className={styles.fieldLabel}>Profile</span>
          {PROFILE_IDS.map((id) => (
            <Link key={id} href={`/advisor?profile=${id}`} className={`${styles.subLink} ${id === profile ? styles.subLinkActive : ''}`} aria-current={id === profile ? 'page' : undefined}>
              {PROFILES[id].label}
            </Link>
          ))}
        </nav>
      )}
      <p className={styles.muted}>
        {usingPreset
          ? `No policy saved, so the ${PROFILES[profile].label} preset applies: ${rules.limits.maxStockPct}% per stock, ${rules.limits.maxSectorPct}% per sector. Open Allocation rules to write your own.`
          : `Using your saved policy: ${rules.limits.maxStockPct}% per stock, ${rules.limits.maxSectorPct}% per sector.`}{' '}
        Everything below is computed from your holdings. It is decision support: you place any order yourself.
      </p>

      {holdings.length === 0 ? (
        <div className={styles.card}>
          <p className={styles.muted}>No holdings yet. <Link href="/portfolio">Add holdings in Portfolio</Link> and this page fills in.</p>
        </div>
      ) : (
        <>
          <DeploymentSimulator holdings={holdings} limits={rules.limits} target={rules.target} />

          <div className={styles.twoCol}>
            <section className={styles.card} aria-labelledby="drift-h">
              <p className={styles.eyebrow}>Allocation and risk drift</p>
              <h2 id="drift-h" className={styles.h2}>{inr(audit.totalValue)} across {holdings.length} holdings</h2>
              {audit.alerts.length === 0 ? (
                <p className={styles.muted}>Every position is inside your limits.</p>
              ) : (
                <ul className={styles.claims}>{audit.alerts.map((a) => <li key={a} className={styles.claim}>{a}</li>)}</ul>
              )}
              <LimitBars title="Single stocks" rows={audit.stocks} />
              <LimitBars title="Sectors" rows={audit.sectors} />
              <p className={styles.note}>Top 3 holdings are {audit.top3Pct.toFixed(1)}% of the portfolio.{audit.unpricedCount > 0 ? ` ${audit.unpricedCount} holding(s) without a live price are left out.` : ''}</p>
            </section>

            <div>
              <section className={styles.card} aria-labelledby="dd-h">
                <p className={styles.eyebrow}>Drawdown review</p>
                <h2 id="dd-h" className={styles.h2}>Holdings down 30% or more on cost</h2>
                {drawdowns.length === 0 ? (
                  <p className={styles.muted}>None right now.</p>
                ) : (
                  <ul className={styles.claims}>
                    {drawdowns.map((d) => (
                      <li key={d.symbol} className={styles.claim}>
                        <strong>{d.symbol}</strong> {d.returnPct.toFixed(1)}% ({inr(d.lossINR)} below cost, {d.weightPct.toFixed(1)}% of the portfolio) · <Link href="/agents">Open the Analyst Desk</Link>
                      </li>
                    ))}
                  </ul>
                )}
                {drawdowns.length > 0 && (
                  <p className={styles.note}>Review each against its original reason for owning it. A realised loss can offset realised gains for tax; check the current rules or ask a tax professional.</p>
                )}
              </section>
              <FitChecker profile={profile} />
            </div>
          </div>

          <DecisionTracker rows={tracker} />
        </>
      )}

      <section className={styles.card} aria-labelledby="tools-h">
        <h2 id="tools-h" className={styles.h2}>Deeper tools</h2>
        <div className={styles.linkRow}>
          {TOOLS.map((t) => <Link key={t.href} href={t.href} className={styles.btnGhost}>{t.label}</Link>)}
        </div>
      </section>
    </>
  );
}
