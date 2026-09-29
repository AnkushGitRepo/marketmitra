// Tag derivation for the dashboard/portfolio "Recent activity" card
// (ADR 0030). Pulled out of ActivityCard.tsx as a pure function so the
// mapping from a notification's `meta` to its display tags is unit-testable
// without a component-testing setup (this codebase has none).

export interface TaggableNotification {
  kind: string;
  meta: Record<string, unknown>;
}

const ALERT_TYPE_TAGS: Record<string, string> = {
  trailing_stop: 'STOP-LOSS',
  cumulative_drawdown: 'DRAWDOWN',
  price_threshold: 'PRICE TARGET',
  percent_move: 'BIG MOVE',
  week52_breach: '52-WEEK',
  portfolio_pnl: 'PORTFOLIO',
};

export function tagsForActivity(item: TaggableNotification): string[] {
  const tags: string[] = [];
  const alertType = item.meta.alertType;
  if (typeof alertType === 'string' && ALERT_TYPE_TAGS[alertType]) {
    tags.push(ALERT_TYPE_TAGS[alertType]);
  }
  const source = item.meta.source;
  if (source === 'auto_guardrail' || source === 'mitra') {
    tags.push('MITRA AUTO');
  }
  if (tags.length === 0 && item.kind === 'system') {
    tags.push('SYSTEM');
  }
  return tags;
}
