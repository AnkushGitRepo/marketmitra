'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { existingSetupSummary, riskChangeNotice } from '@/lib/onboarding/existing';
import { DEFAULT_RISK_PROFILE, RISK_PROFILES, type RiskProfileId } from '@/lib/onboarding/profiles';
import type { AiProvider } from '@/lib/userSettings';
import { AiStep } from './AiStep';
import { CompletionScreen } from './CompletionScreen';
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

export function OnboardingWizard({ initialRiskProfile, initialHoldings, savedProvider, analystsActive, hosted }: OnboardingWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [risk, setRisk] = useState<RiskProfileId>(initialRiskProfile ?? DEFAULT_RISK_PROFILE);
  const [savedRisk, setSavedRisk] = useState<RiskProfileId | null>(initialRiskProfile);
  const [confirmingRisk, setConfirmingRisk] = useState(false);
  // What was already saved when the page opened: shown as Active, and the basis for the returning-user notice.
  const [activeIds] = useState<ReadonlySet<string>>(() => new Set(initialHoldings.map((h) => h.id)));
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
  const saveRisk = () => run(async () => {
    await post({ riskProfile: risk });
    setSavedRisk(risk);
    setConfirmingRisk(false);
    setStep(1);
  });
  // Changing an already-saved profile needs a second, explicit click that spells out what changes.
  const continueFromRisk = () => (savedRisk && savedRisk !== risk && !confirmingRisk ? setConfirmingRisk(true) : void saveRisk());
  const launch = () => run(async () => {
    const res = await post({ status: 'completed' });
    if (res.data) setSummary(res.data);
  });

  const existingSummary = existingSetupSummary(initialHoldings.length, initialRiskProfile);

  if (summary) {
    return <CompletionScreen summary={summary} risk={savedRisk} provider={provider} symbols={holdings.map((h) => h.symbol)} onNavigate={leave} />;
  }

  return (
    <div className={styles.wizard}>
      <WizardHeader step={step} busy={busy} onSkipSetup={() => void skipSetup()} onDemo={() => router.push('/onboarding/demo')} onGoToStep={(n) => setStep(n)} />
      <section className={styles.card}>
        {existingSummary && (
          <p className={styles.notice} role="status">
            <span>
              You already have a setup ({existingSummary}). Changes here update your live settings.
            </span>
            <Link href="/dashboard" className={styles.link}>
              ← Back to dashboard
            </Link>
          </p>
        )}
        {step === 0 && <RiskStep value={risk} onChange={(id) => { setRisk(id); setConfirmingRisk(false); }} current={savedRisk} />}
        {step === 1 && <HoldingsStep holdings={holdings} onChanged={refreshHoldings} analystsActive={analystsActive} activeIds={activeIds} />}
        {step === 2 && <AiStep savedProvider={provider} onSaved={setProvider} hosted={hosted} />}

        {confirmingRisk && savedRisk && (
          <p className={styles.notice} role="alertdialog" aria-label="Confirm risk profile change">
            {riskChangeNotice(savedRisk, risk, holdings.length)}
          </p>
        )}

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <div className={styles.footer}>
          {step > 0 ? (
            <button type="button" className={styles.link} onClick={() => setStep(step - 1)} disabled={busy}>
              Back
            </button>
          ) : (
            <span />
          )}
          <div className={styles.footerRight}>
            {step === 1 && (
              <button type="button" className={styles.link} onClick={() => setStep(step + 1)} disabled={busy}>
                Skip for now
              </button>
            )}
            {step === 0 && (
              <button type="button" className={styles.primary} onClick={() => void continueFromRisk()} disabled={busy}>
                {confirmingRisk ? `Confirm ${RISK_PROFILES[risk].label}` : 'Continue'}
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
