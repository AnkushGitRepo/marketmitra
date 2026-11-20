'use client';

import { useState } from 'react';
import type { NavPoint } from '@/lib/funds/types';
import { NavChart } from './NavChart';
import { SipSimulator } from './SipSimulator';
import styles from './FundChartPanel.module.css';

type Mode = 'nav' | 'sip';

interface FundChartPanelProps {
  readonly schemeCode: number;
  readonly initialSeries: readonly NavPoint[];
}

const MODES: readonly { readonly id: Mode; readonly label: string }[] = [
  { id: 'nav', label: 'NAV history' },
  { id: 'sip', label: 'SIP simulator' },
];

export function FundChartPanel({ schemeCode, initialSeries }: FundChartPanelProps) {
  const [mode, setMode] = useState<Mode>('nav');
  return (
    <div className={styles.panel}>
      <div className={styles.modes} role="group" aria-label="Chart mode">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`${styles.mode} ${m.id === mode ? styles.active : ''}`}
            aria-pressed={m.id === mode}
            onClick={() => setMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
      {mode === 'nav' ? <NavChart schemeCode={schemeCode} initialRange="1y" initialSeries={initialSeries} /> : <SipSimulator key={schemeCode} schemeCode={schemeCode} />}
    </div>
  );
}
