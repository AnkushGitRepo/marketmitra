import Link from 'next/link';
import { advisorPageUser } from '@/lib/advisor/pageGuard';
import { getPolicy } from '@/lib/advisor/policy/store';
import { computeMonthlyPlan, type MonthlyPlan } from '@/lib/advisor/allocation/core';
import styles from '@/components/advisor/advisor.module.css';

export const dynamic = 'force-dynamic';

const KIND_LABEL = {
  buy_index: 'Buy',
  hold_satellite: 'Hold',
  hold_cash: 'Hold',
  rebalance_sell: 'Sell',
} as const;

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export default async function AdvisorPlanPage() {
  const userId = await advisorPageUser();
  if (!userId) return null;
  const policy = await getPolicy(userId).catch(() => null);

  if (!policy) {
    return (
      <div className={styles.card}>
        <p className={styles.eyebrow}>This month</p>
        <h1 className={styles.h1}>No policy yet</h1>
        <p className={styles.muted}>
          The plan is produced from your Investment Policy. <Link href="/dashboard/advisor/policy">Write it first.</Link>
        </p>
      </div>
    );
  }

  const plan: MonthlyPlan = computeMonthlyPlan({
    policy,
    asOf: new Date().toISOString().slice(0, 10),
  });

  return (
    <>
      <div className={styles.headRow}>
        <div>
          <p className={styles.eyebrow}>This month · {plan.month}</p>
          <h1 className={styles.h1}>{plan.summary}</h1>
        </div>
      </div>
      <p className={styles.muted}>
        Produced by fixed rules from your policy — the same inputs always give the same plan. It is a
        proposal: you confirm and place any order yourself, in your own broker.
      </p>
      <div className={styles.card}>
        {plan.lines.length === 0 ? (
          <p className={styles.muted}>Nothing to deploy this month.</p>
        ) : (
          <ul className={styles.lines}>
            {plan.lines.map((l, i) => (
              <li key={i} className={styles.line}>
                <span className={styles.tag}>{KIND_LABEL[l.kind]}</span>
                <span className={styles.lineTarget}>{l.target}</span>
                <span className={styles.lineAmount}>{inr(l.amountINR)}</span>
                <span className={styles.lineRule}>{l.rule}</span>
              </li>
            ))}
          </ul>
        )}
        {plan.notes.map((n) => (
          <p key={n} className={styles.note}>
            {n}
          </p>
        ))}
      </div>
      <p className={styles.muted}>
        The satellite share stays in cash: the plan never picks stocks for you. Use Screen and Research to
        examine a company yourself, and record any recommendation in the Journal. Rebalancing is not checked
        here because your current holdings are not read.
      </p>
    </>
  );
}
