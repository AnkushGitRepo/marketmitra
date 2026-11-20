'use client';

import { useEffect } from 'react';
import type { CompareItem } from '@/lib/funds/compare';
import { useCompareSelection } from './useCompareSelection';

/**
 * The compare page's link is the truth for what is being compared: this makes the picked funds match it, so
 * removing a fund here, or opening a shared link, is reflected when you go back to the screener.
 */
export function CompareSync({ items }: { readonly items: readonly CompareItem[] }) {
  const { replace } = useCompareSelection();
  const key = JSON.stringify(items);
  useEffect(() => {
    replace(JSON.parse(key) as CompareItem[]);
  }, [key, replace]);
  return null;
}
