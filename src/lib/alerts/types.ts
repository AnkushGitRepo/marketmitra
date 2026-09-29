// Phase 5 alerts — shared types (ADR 0014).

export type AlertType =
  | 'price_threshold'
  | 'percent_move'
  | 'week52_breach'
  | 'portfolio_pnl'
  | 'trailing_stop'
  | 'cumulative_drawdown'
  | 'ipo_watch'
  | 'ipo';

/** Who/what created an alert — drives the "Mitra activity" audit trail and
 * lets the UI label auto-created guardrails differently from a user's own.
 * `mitra` is an alert Mitra created or edited off its own judgment (always
 * logged with a reason — see src/lib/mitra/activityLog.ts); `auto_guardrail`
 * is the default pair created silently when a holding is added. */
export type AlertSource = 'user' | 'auto_guardrail' | 'mitra';

export type IpoTrigger = 'opens' | 'last_day' | 'allotment_listing' | 'gmp_threshold';

export type AlertStatus = 'active' | 'triggered' | 'paused';

/** Notify when the last price crosses a set level. Target-price and
 * stop-loss are the same thing with a different `direction`. */
export interface PriceThresholdParams {
  direction: 'above' | 'below';
  threshold: number;
}

/** Notify on an intraday move from the previous close. */
export interface PercentMoveParams {
  direction: 'up' | 'down' | 'either';
  pct: number; // magnitude, always positive (e.g. 5 means ±5%)
}

/** Notify on a new 52-week high/low, or coming within `withinPct` of one
 * (0 / omitted = an actual breach). */
export interface Week52BreachParams {
  edge: 'high' | 'low';
  withinPct?: number;
}

/** Notify when a portfolio-level figure crosses a set level. `symbol`
 * (optional) scopes it to one holding instead of the whole book. */
export interface PortfolioPnlParams {
  metric: 'total_value' | 'unrealized_pnl' | 'unrealized_pnl_pct';
  direction: 'above' | 'below';
  threshold: number;
}

/** A stop-loss that ratchets up with the stock's own peak instead of
 * sitting at one static floor. `peakPrice` on the `Alert` doc tracks the
 * highest price seen since the alert was created (or last un-paused) and
 * only ever increases; this fires when the live price falls `trailPct`%
 * below that peak. Locks in gains on the way up without needing to be
 * manually re-priced. */
export interface TrailingStopParams {
  trailPct: number;
}

/** Notify on a slow bleed a single day's percent-move alert can miss —
 * the price down `pct`% or more versus its close `windowSessions` trading
 * sessions ago, not just versus yesterday. This is the type that would
 * have caught a ~40%-over-4-sessions slide even if no single day looked
 * dramatic on its own. */
export interface CumulativeDrawdownParams {
  windowSessions: number;
  pct: number;
}

/** One per user (ADR 0017). Fires once per (IPO, trigger) pair — idempotency
 * via the alert doc's `sentKeys`. */
export interface IpoWatchParams {
  triggers: { opens: boolean; lastDay: boolean; allotmentListing: boolean };
  /** Also fire when a matching IPO's GMP% crosses this magnitude. */
  gmpThresholdPct?: number;
  ipoType: 'all' | 'mainboard';
}

/** Per-IPO alert set from a row on the IPO page. */
export interface IpoAlertParams {
  ipoSlug: string;
  trigger: IpoTrigger;
  gmpThresholdPct?: number;
  gmpThresholdAbs?: number;
}

export type AlertParams =
  | ({ type: 'price_threshold' } & PriceThresholdParams)
  | ({ type: 'percent_move' } & PercentMoveParams)
  | ({ type: 'week52_breach' } & Week52BreachParams)
  | ({ type: 'portfolio_pnl' } & PortfolioPnlParams)
  | ({ type: 'trailing_stop' } & TrailingStopParams)
  | ({ type: 'cumulative_drawdown' } & CumulativeDrawdownParams)
  | ({ type: 'ipo_watch' } & IpoWatchParams)
  | ({ type: 'ipo' } & IpoAlertParams);

export interface Alert {
  id: string;
  userId: string;
  type: AlertType;
  /** Present for price_threshold / percent_move / week52_breach, and for a
   * holding-scoped portfolio_pnl. Absent for a whole-book portfolio_pnl. */
  symbol: string | null;
  params: Omit<AlertParams, 'type'>;
  note: string | null;
  status: AlertStatus;
  /** When true the alert re-arms after firing (subject to cooldown +
   * hysteresis) instead of going one-shot to `triggered`. */
  rearm: boolean;
  cooldownMinutes: number;
  /** Internal re-arm gate: false between a fire and the condition next
   * going false past its cooldown. Meaningless for non-rearm alerts. */
  armed: boolean;
  cooldownUntil: Date | null;
  lastEvaluatedAt: Date | null;
  triggeredAt: Date | null;
  lastObservedValue: number | null;
  /** `ipo_watch` only: `"<ipoSlug>:<trigger>"` keys already notified, so a
   * standing watch doesn't re-fire for the same IPO event. */
  sentKeys: string[] | null;
  /** `trailing_stop` only: the highest price observed since this alert was
   * created/re-armed. Null until the first evaluation cycle seeds it. */
  peakPrice: number | null;
  /** Who created this alert — see `AlertSource`. Defaults to 'user'. */
  source: AlertSource;
  createdAt: Date;
  updatedAt: Date;
}

/** The IPO fields an alert evaluation needs — from fundamentals-api `GET /ipos`. */
export interface IpoSnapshot {
  slug: string;
  name: string;
  category: 'mainboard' | 'sme';
  status: 'upcoming' | 'open' | 'closed' | 'listed';
  gmp: number | null;
  gmpPct: number | null;
  openDate: string | null;
  closeDate: string | null;
  allotmentDate: string | null;
  listingDate: string | null;
}

/** The market data one evaluation needs for a single symbol — shaped from
 * fundamentals-api's `GET /quote`. */
export interface MarketSnapshot {
  price: number;
  prevClose: number | null;
  changePct: number | null;
  week52High: number | null;
  week52Low: number | null;
}

/** Portfolio figures the cron computes by joining holdings + quotes. */
export interface PortfolioMetrics {
  totalValue: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
}

export interface EvalResult {
  /** True when the alert's condition is currently satisfied. */
  triggered: boolean;
  /** The number the condition was checked against (for display + storage). */
  observedValue: number;
}
