// The price alert behind a conviction target (#411). The board does not poll prices itself: it keeps one ordinary
// price alert per entry, so delivery (in-app and email), cooldowns and the Alerts page all work as they already do.

import type { AlertParams } from '@/lib/alerts/types';
import type { TargetDirection } from './schema';

export const TARGET_ALERT_NOTE_PREFIX = 'Conviction target';

export function targetAlertParams(targetPrice: number, direction: TargetDirection): Omit<AlertParams, 'type'> {
  return { direction: direction === 'at_or_below' ? 'below' : 'above', threshold: targetPrice };
}

export function targetAlertNote(symbol: string, direction: TargetDirection): string {
  return `${TARGET_ALERT_NOTE_PREFIX}: ${symbol} ${direction === 'at_or_below' ? 'at or below' : 'at or above'} your entry price`;
}
