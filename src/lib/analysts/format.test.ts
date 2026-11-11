import { describe, expect, it } from 'vitest';
import { agoLabel, kindLabel, statusView } from './format';

const NOW = new Date('2026-11-11T12:00:00Z');

describe('agoLabel', () => {
  it('reads like a person would say it', () => {
    expect(agoLabel('2026-11-11T11:59:40Z', NOW)).toBe('just now');
    expect(agoLabel('2026-11-11T11:48:00Z', NOW)).toBe('12m ago');
    expect(agoLabel('2026-11-11T09:00:00Z', NOW)).toBe('3h ago');
    expect(agoLabel('2026-11-09T12:00:00Z', NOW)).toBe('2d ago');
  });
  it('says "not yet" for no date and never shows a negative age', () => {
    expect(agoLabel(null, NOW)).toBe('not yet');
    expect(agoLabel('2026-11-11T12:05:00Z', NOW)).toBe('just now');
  });
});

describe('statusView', () => {
  it('maps each status to a label and tone', () => {
    expect(statusView('active', null)).toEqual({ label: 'Vigilant', tone: 'good' });
    expect(statusView('initializing', null)).toEqual({ label: 'Building dossier', tone: 'wait' });
    expect(statusView('paused', null)).toEqual({ label: 'Paused', tone: 'muted' });
    expect(statusView('error', 'bad key')).toEqual({ label: 'Needs attention', tone: 'bad' });
  });
  it('calls out a missing key while the dossier waits', () => {
    expect(statusView('initializing', 'Waiting for an AI key. Add one in Settings.')).toEqual({ label: 'Needs an AI key', tone: 'bad' });
  });
});

describe('kindLabel', () => {
  it('names every journal kind', () => {
    expect(kindLabel('earnings')).toBe('Results');
    expect(kindLabel('initiation')).toBe('Initiation');
    expect(kindLabel('range')).toBe('52-week range');
  });
});
