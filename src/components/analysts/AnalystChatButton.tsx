'use client';

import { useState } from 'react';
import { AnalystDrawer, type DrawerPanel } from './AnalystDrawer';
import styles from './AnalystChatButton.module.css';

/** "Chat with this analyst" for a stock page: opens the same slide-over as the Analyst Desk. */
export function AnalystChatButton({ symbol }: { readonly symbol: string }) {
  const [panel, setPanel] = useState<DrawerPanel | null>(null);
  return (
    <>
      <button type="button" className={styles.button} onClick={() => setPanel({ kind: 'chat', symbol })}>
        Chat with this analyst
      </button>
      <AnalystDrawer panel={panel} onChange={setPanel} onClose={() => setPanel(null)} />
    </>
  );
}
