// Plain-words labels for the analyst roster and journal (#128). Pure.

import type { AnalystStatus, JournalKind } from './types';

export function agoLabel(iso: string | null, now: Date): string {
  if (!iso) return 'not yet';
  const mins = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export type StatusTone = 'good' | 'wait' | 'muted' | 'bad';

export function statusView(status: AnalystStatus, note: string | null): { label: string; tone: StatusTone } {
  switch (status) {
    case 'active':
      return { label: 'Vigilant', tone: 'good' };
    case 'initializing':
      return /AI key/i.test(note ?? '') ? { label: 'Needs an AI key', tone: 'bad' } : { label: 'Building dossier', tone: 'wait' };
    case 'paused':
      return { label: 'Paused', tone: 'muted' };
    case 'error':
      return { label: 'Needs attention', tone: 'bad' };
  }
}

const KIND_LABEL: Record<JournalKind, string> = {
  initiation: 'Initiation',
  price: 'Price',
  volume: 'Volume',
  range: '52-week range',
  news: 'News',
  filing: 'Filing',
  earnings: 'Results',
};

export const kindLabel = (kind: JournalKind): string => KIND_LABEL[kind];
