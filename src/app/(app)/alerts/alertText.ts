import { formatInr } from '@/lib/dashboard/format';
import type {
  Alert,
  CumulativeDrawdownParams,
  IpoAlertParams,
  IpoWatchParams,
  PercentMoveParams,
  PortfolioPnlParams,
  PriceThresholdParams,
  TrailingStopParams,
  Week52BreachParams,
} from '@/lib/alerts/types';

const ALERT_TYPE_LABELS: Record<Alert['type'], string> = {
  price_threshold: 'Price',
  percent_move: 'Percent move',
  week52_breach: '52-week',
  portfolio_pnl: 'Portfolio',
  trailing_stop: 'Trailing stop',
  cumulative_drawdown: 'Drawdown watch',
  ipo_watch: 'IPO watch',
  ipo: 'IPO',
};

const IPO_TRIGGER_TEXT: Record<IpoAlertParams['trigger'], string> = {
  opens: 'opens',
  last_day: 'last day to apply',
  allotment_listing: 'allotment / listing day',
  gmp_threshold: 'GMP crosses threshold',
};

export function alertTypeLabel(type: Alert['type']): string {
  return ALERT_TYPE_LABELS[type];
}

const PNL_METRIC_LABELS: Record<PortfolioPnlParams['metric'], string> = {
  total_value: 'value',
  unrealized_pnl: 'P&L',
  unrealized_pnl_pct: 'P&L %',
};

/** A one-line human description of what an alert is watching for. */
export function describeAlert(alert: Alert): string {
  switch (alert.type) {
    case 'price_threshold': {
      const p = alert.params as PriceThresholdParams;
      const tail = p.direction === 'below' ? ' (stop-loss)' : '';
      return `${alert.symbol} ${p.direction} ${formatInr(p.threshold)}${tail}`;
    }
    case 'percent_move': {
      const p = alert.params as PercentMoveParams;
      if (p.direction === 'either') return `${alert.symbol} moves ±${p.pct}% in a day`;
      return `${alert.symbol} ${p.direction} ${p.pct}% in a day`;
    }
    case 'week52_breach': {
      const p = alert.params as Week52BreachParams;
      if (p.withinPct && p.withinPct > 0) {
        return `${alert.symbol} within ${p.withinPct}% of its 52-week ${p.edge}`;
      }
      return `${alert.symbol} hits a 52-week ${p.edge}`;
    }
    case 'portfolio_pnl': {
      const p = alert.params as PortfolioPnlParams;
      const subject = alert.symbol ? `${alert.symbol} P&L` : `Portfolio ${PNL_METRIC_LABELS[p.metric]}`;
      const value =
        p.metric === 'unrealized_pnl_pct' ? `${p.threshold}%` : formatInr(p.threshold);
      return `${subject} ${p.direction} ${value}`;
    }
    case 'trailing_stop': {
      const p = alert.params as TrailingStopParams;
      const peak = alert.peakPrice !== null ? ` (peak so far ${formatInr(alert.peakPrice)})` : '';
      return `${alert.symbol} falls ${p.trailPct}% below its peak${peak}`;
    }
    case 'cumulative_drawdown': {
      const p = alert.params as CumulativeDrawdownParams;
      return `${alert.symbol} down ${p.pct}%+ over ${p.windowSessions} sessions`;
    }
    case 'ipo_watch': {
      const p = alert.params as IpoWatchParams;
      const on = [
        p.triggers.opens && 'opens',
        p.triggers.lastDay && 'last day',
        p.triggers.allotmentListing && 'allotment/listing',
        p.gmpThresholdPct !== undefined && `GMP ±${p.gmpThresholdPct}%`,
      ].filter(Boolean);
      const scope = p.ipoType === 'mainboard' ? 'Mainboard IPOs' : 'All IPOs';
      return `${scope} — ${on.length ? on.join(', ') : 'no triggers'}`;
    }
    case 'ipo': {
      const p = alert.params as IpoAlertParams;
      const extra =
        p.trigger === 'gmp_threshold' && p.gmpThresholdPct !== undefined
          ? ` (±${p.gmpThresholdPct}%)`
          : '';
      return `${p.ipoSlug.replace(/-ipo$/, '').replace(/-/g, ' ')} — ${IPO_TRIGGER_TEXT[p.trigger]}${extra}`;
    }
  }
}

export interface AlertStatusView {
  label: string;
  tone: 'active' | 'triggered' | 'paused';
}

export function alertStatusView(alert: Alert): AlertStatusView {
  if (alert.status === 'paused') return { label: 'Paused', tone: 'paused' };
  if (alert.status === 'triggered') {
    return { label: alert.triggeredAt ? `Triggered ${relativeTime(alert.triggeredAt)}` : 'Triggered', tone: 'triggered' };
  }
  // active
  if (alert.rearm && !alert.armed) return { label: 'Cooling down', tone: 'active' };
  return { label: 'Watching', tone: 'active' };
}

export function relativeTime(value: Date | string): string {
  const then = typeof value === 'string' ? new Date(value) : value;
  const secs = Math.round((Date.now() - then.getTime()) / 1000);
  if (secs < 45) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return then.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
