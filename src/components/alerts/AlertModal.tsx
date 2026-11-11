'use client';

import { useEffect, useRef } from 'react';
import { AlertForm } from '@/app/(app)/alerts/AlertForm';
import { STOCK_ALERT_TYPES } from '@/lib/alerts/stockAlertTypes';
import styles from './AlertModal.module.css';

interface AlertModalProps {
  readonly open: boolean;
  readonly symbol: string;
  /** Called after an alert was created (the modal then closes). */
  readonly onCreated: () => void;
  readonly onClose: () => void;
}

/** Sets an alert for one stock without leaving the page. Reuses the Alerts page form, so types, validation and the API are the same. */
export function AlertModal({ open, symbol, onCreated, onClose }: AlertModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="alert-modal-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {/* Mounted only while open, so every opening starts with a fresh form. */}
      {open && (
        <>
          <h2 id="alert-modal-title" className={styles.title}>
            Set alert for {symbol}
          </h2>
          <AlertForm initialSymbol={symbol} lockSymbol types={STOCK_ALERT_TYPES} onSaved={onCreated} onClose={onClose} />
        </>
      )}
    </dialog>
  );
}
