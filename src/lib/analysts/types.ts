// Stock analysts (Analyst Desk, #127 / #128, ADR 0058): a persistent AI analyst per holding with a dossier and a journal.

export type AnalystStatus = 'initializing' | 'active' | 'paused' | 'error';
export type AnalystSource = 'holding' | 'watcher';
export type JournalKind = 'initiation' | 'price' | 'volume' | 'range' | 'news' | 'filing' | 'earnings';
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
