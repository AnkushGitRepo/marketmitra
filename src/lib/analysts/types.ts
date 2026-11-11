// Stock analysts (Analyst Desk, #127 / #128, ADR 0058): a persistent AI analyst per holding with a dossier and a journal.

export type AnalystStatus = 'initializing' | 'active' | 'paused' | 'error';
export type AnalystSource = 'holding' | 'watcher';
export type JournalKind = 'initiation' | 'price' | 'volume' | 'range' | 'news' | 'filing' | 'earnings' | 'thesis';
export type AlertLevel = 'low' | 'medium' | 'high';
export type Impact = 'positive' | 'neutral' | 'negative';

/** What the heartbeat remembers between runs, so the same news item or filing is never reported twice. */
export interface WatchState {
  seenNewsUrls: string[];
  seenDocUrls: string[];
  /** A fingerprint of the latest quarterly figures; a change is a results event. */
  resultsKey: string | null;
  atRangeHigh: boolean;
  atRangeLow: boolean;
}

export const EMPTY_WATCH: WatchState = { seenNewsUrls: [], seenDocUrls: [], resultsKey: null, atRangeHigh: false, atRangeLow: false };

export interface DossierPillar {
  title: string;
  text: string;
}

/** The baseline thesis written at initiation: what the data supports, and where it is thin. */
export interface Dossier {
  summary: string;
  business: string;
  strengths: DossierPillar[];
  vulnerabilities: DossierPillar[];
  /** Things the analyst could not assess because our data does not have them. */
  notAvailable: string[];
  generatedAt: string;
  model: string;
}

export interface JournalEntry {
  id: string;
  symbol: string;
  ts: string;
  kind: JournalKind;
  title: string;
  /** The AI's reading of the event; null when it is a plain recorded fact (cap reached, or no key). */
  body: string | null;
  impact: Impact | null;
  alert: AlertLevel;
}

export interface MaterialEvent {
  /** Stable per occurrence, used to avoid duplicates. */
  key: string;
  kind: Exclude<JournalKind, 'initiation'>;
  title: string;
  /** Plain facts the AI may reason over. */
  facts: string[];
  alert: AlertLevel;
}

/** The observable measures a thesis criterion can watch. A closed set, so every criterion can be checked deterministically. */
export type CriterionMetric = 'roce' | 'roe' | 'debtToEquity' | 'promoterHolding' | 'promoterChange4q' | 'qtrSalesYoyPct' | 'qtrProfitYoyPct' | 'negativeNewsPct';

/** One condition that would weaken the baseline thesis. Evaluated every day by the heartbeat, with no AI. */
export interface ThesisCriterion {
  /** The metric name: an analyst has at most one criterion per metric. */
  id: CriterionMetric;
  metric: CriterionMetric;
  /** `below` or `above` is fixed by the metric (the direction that weakens a thesis). */
  op: 'below' | 'above';
  threshold: number;
  /** The metric's value when the criterion was set, or null when it was not readable then. */
  baseline: number | null;
  /** One line from the analyst on why this matters; empty for the defaults. */
  why: string;
  source: 'analyst' | 'default';
  /** The user can switch a criterion off without removing it. */
  enabled: boolean;
  /** Whether the metric is currently past the threshold, so a breach is reported once and re-arms when it recovers. */
  breached: boolean;
}
