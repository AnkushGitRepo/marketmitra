'use client';

import { useEffect, useRef, useState } from 'react';
import type { InvestmentPolicy } from '@/lib/advisor/policy/schema';
import { PolicyForm } from './PolicyForm';
import styles from './advisor.module.css';

interface Props {
  initial: InvestmentPolicy;
  hasSaved: boolean;
}

/** The full policy form, kept out of the way until the user wants to change a rule. */
export function RulesDrawer({ initial, hasSaved }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      <button type="button" className={styles.btnGhost} onClick={() => setOpen(true)}>Allocation rules</button>
      <dialog ref={ref} className={styles.drawer} aria-label="Allocation rules" onClose={() => setOpen(false)}>
        <div className={styles.drawerBar}>
          <button type="button" className={styles.btnGhost} onClick={() => setOpen(false)}>Close</button>
        </div>
        {open && <PolicyForm initial={initial} hasSaved={hasSaved} />}
      </dialog>
    </>
  );
}
