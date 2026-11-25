// Reading the streamed company report on the page (#360): lines of JSON in, report state out. Pure.

import { CHAPTERS, type ChapterId, type ReportChapter, type ReportEvent } from './chapters';

export interface ReportState {
  readonly symbol: string | null;
  readonly name: string | null;
  /** The chapters announced by `start`, in reading order. */
  readonly order: readonly ChapterId[];
  readonly chapters: Readonly<Partial<Record<ChapterId, ReportChapter>>>;
  readonly done: Extract<ReportEvent, { type: 'done' }> | null;
  readonly error: string | null;
}

export const EMPTY_REPORT: ReportState = { symbol: null, name: null, order: [], chapters: {}, done: null, error: null };

const KNOWN = new Set<string>(CHAPTERS.map((c) => c.id));

/** Folds one event into the state; an event the page does not know is ignored. */
export function reduceReport(state: ReportState, event: ReportEvent): ReportState {
  switch (event.type) {
    case 'start':
      return { ...EMPTY_REPORT, symbol: event.symbol, name: event.name, order: event.chapters.map((c) => c.id).filter((id) => KNOWN.has(id)) };
    case 'chapter':
      return KNOWN.has(event.chapter.id) ? { ...state, chapters: { ...state.chapters, [event.chapter.id]: event.chapter } } : state;
    case 'done':
      return { ...state, done: event };
    case 'error':
      return { ...state, error: event.message };
    default:
      return state;
  }
}

export interface Progress {
  /** Chapters whose text is finished, written or failed. */
  readonly finished: number;
  readonly total: number;
}

export function reportProgress(state: ReportState): Progress {
  const total = state.order.length;
  const finished = state.order.filter((id) => {
    const status = state.chapters[id]?.status;
    return status === 'ready' || status === 'failed';
  }).length;
  return { finished, total };
}

export interface ParsedChunk {
  readonly events: readonly ReportEvent[];
  /** An unfinished last line, to be put in front of the next chunk. */
  readonly rest: string;
}

/** Complete lines of newline-delimited JSON from `buffer + chunk`; a line that is not valid JSON is dropped, not fatal. */
export function parseNdjson(buffer: string, chunk: string): ParsedChunk {
  const lines = `${buffer}${chunk}`.split('\n');
  const rest = lines.pop() ?? '';
  const events = lines.flatMap((line) => {
    const text = line.trim();
    if (!text) return [];
    try {
      const value = JSON.parse(text) as { type?: unknown };
      return typeof value.type === 'string' ? [value as ReportEvent] : [];
    } catch {
      return [];
    }
  });
  return { events, rest };
}
