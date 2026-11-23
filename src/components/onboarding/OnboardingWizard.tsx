'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { DEFAULT_RISK_PROFILE, type RiskProfileId } from '@/lib/onboarding/profiles';
import type { AiProvider } from '@/lib/userSettings';
import { AiStep } from './AiStep';
import type { HoldingRow } from './HoldingsList';
import { HoldingsStep } from './HoldingsStep';
import { RiskStep } from './RiskStep';
import { WizardHeader } from './WizardHeader';
import styles from './Onboarding.module.css';

export interface OnboardingWizardProps {
  readonly initialRiskProfile: RiskProfileId | null;
  readonly initialHoldings: readonly HoldingRow[];
  readonly savedProvider: AiProvider | null;
  readonly analystsActive: boolean;
  readonly hosted: boolean;
}

interface Summary {
  readonly holdings: number;
  readonly analystsQueued: number;
  readonly hasAiKey: boolean;
}

interface ApiEnvelope {
  readonly success?: boolean;
  readonly data?: Summary;
  readonly error?: string;
}

async function post(body: { riskProfile?: RiskProfileId; status?: 'completed' | 'dismissed' }): Promise<ApiEnvelope> {
  const res = await fetch('/api/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => null)) as ApiEnvelope | null;
  if (!res.ok || !json?.success) throw new Error(json?.error ?? 'Could not save. Please try again.');
  return json;
}

function doneMessage(s: Summary): string {
  if (s.analystsQueued > 0) {
    return `${s.analystsQueued} analyst${s.analystsQueued === 1 ? '' : 's'} will start building dossiers on the next scheduled run.`;
  }
  if (s.holdings > 0 && !s.hasAiKey) return 'Your holdings are saved. Add an AI key in Settings whenever you are ready, and your analysts will start.';
  if (s.holdings > 0) return 'Your holdings are saved. Automatic analysts are switched off in Settings.';
  return 'Add holdings from the Portfolio page whenever you are ready.';
}

export function OnboardingWizard({ initialRiskProfile, initialHoldings, savedProvider, analystsActive, hosted }: OnboardingWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [risk, setRisk] = useState<RiskProfileId>(initialRiskProfile ?? DEFAULT_RISK_PROFILE);
  const [holdings, setHoldings] = useState<readonly HoldingRow[]>(initialHoldings);
  const [provider, setProvider] = useState<AiProvider | null>(savedProvider);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  const refreshHoldings = useCallback(async () => {
    try {
      const res = await fetch('/api/holdings');
      const body = (await res.json().catch(() => null)) as { data?: HoldingRow[] } | null;
      if (res.ok && body?.data) setHoldings(body.data.map(({ id, symbol, quantity, avgPrice }) => ({ id, symbol, quantity, avgPrice })));
    } catch {
      /* the list stays as it was; the add itself already succeeded or failed visibly */
    }
  }, []);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const leave = (to: string) => {
    router.push(to);
    router.refresh();
  };

  const skipSetup = () => run(async () => {
    await post({ status: 'dismissed' });
    leave('/dashboard');
  });
  const continueFromRisk = () => run(async () => {
    await post({ riskProfile: risk });
    setStep(1);
  });
  const launch = () => run(async () => {
    const res = await post({ status: 'completed' });
    if (res.data) setSummary(res.data);
  });

  if (summary) {
    return (
      <div className={styles.wizard}>
        <section className={styles.card} aria-live="polite">
          <p className={styles.eyebrow}>All set</p>
          <h1 className={styles.title}>{summary.holdings > 0 ? 'Your desk is ready' : 'Setup saved'}</h1>
          <p className={styles.lead}>{doneMessage(summary)}</p>
          <div className={styles.footer}>
            <span />
            <button type="button" className={styles.primary} onClick={() => leave(summary.holdings > 0 ? '/agents' : '/dashboard')}>
              {summary.holdings > 0 ? 'Open the Analyst Desk' : 'Go to the dashboard'}
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.wizard}>
      <WizardHeader step={step} busy={busy} onSkipSetup={() => void skipSetup()} onDemo={() => router.push('/onboarding/demo')} />
      <section className={styles.card}>
        {step === 0 && <RiskStep value={risk} onChange={setRisk} />}
        {step === 1 && <HoldingsStep holdings={holdings} onChanged={refreshHoldings} analystsActive={analystsActive} />}
        {step === 2 && <AiStep savedProvider={provider} onSaved={setProvider} hosted={hosted} />}

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <div className={styles.footer}>
          {step > 0 ? (
            <button type="button" className={styles.secondary} onClick={() => setStep(step - 1)} disabled={busy}>
              Back
            </button>
          ) : (
            <span />
          )}
          <div className={styles.footerRight}>
            {step < 2 && (
              <button type="button" className={styles.link} onClick={() => setStep(step + 1)} disabled={busy}>
                Skip this step
              </button>
            )}
            {step === 0 && (
              <button type="button" className={styles.primary} onClick={() => void continueFromRisk()} disabled={busy}>
                Continue
              </button>
            )}
            {step === 1 && (
              <button type="button" className={styles.primary} onClick={() => setStep(2)} disabled={busy}>
                Continue to AI setup
              </button>
            )}
            {step === 2 && (
              <button type="button" className={styles.primary} onClick={() => void launch()} disabled={busy}>
                {provider ? 'Launch my analyst desk' : 'Finish without AI'}
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
