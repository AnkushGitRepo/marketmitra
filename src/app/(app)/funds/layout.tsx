import type { ReactNode } from 'react';
import { CompareDock } from '@/components/funds/CompareDock';

// The compare dock follows the funds pages, so a pick made on the screener is still there on a fund page.
export default function FundsLayout({ children }: { readonly children: ReactNode }) {
  return (
    <>
      {children}
      <CompareDock />
    </>
  );
}
