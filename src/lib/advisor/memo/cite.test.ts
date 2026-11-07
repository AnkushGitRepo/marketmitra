import { describe, expect, it } from 'vitest';
import { numbersIn, validateMemo } from './cite';
import type { SourceRef } from './types';

const sources: SourceRef[] = [
  { id: 'AR1-01', label: 'AR', kind: 'passage', text: 'The company serves clients in 46 countries. Revenue was ₹2,40,893 crore in FY2025.' },
  { id: 'AR1-02', label: 'AR', kind: 'passage', text: 'Our switching costs and long client relationships form the core of our moat.' },
  { id: 'F1', label: 'Screen: ROCE', kind: 'fact', text: '5-year average ROCE: avg 59.3%' },
];

const cite = (sourceId: string, quote: string) => ({ sourceId, quote });
const ok = (text: string, c = cite('AR1-02', 'switching costs and long client relationships')) => ({
  text,
  citations: [c],
  notFound: false,
});
const nf = { text: 'Management compensation is not found in provided material', citations: [], notFound: true };
const kill = (over = {}) => ({
  description: 'ROCE stays below 12% for two years',
  metric: 'roce_pct',
  operator: '<',
  threshold: 12,
  consecutivePeriods: 2,
  periodUnit: 'year',
  rationale: ok('Moat rests on returns on capital.'),
  ...over,
});
const good = () => ({
  business: [ok('It sells IT services.')],
  moat: { assessment: ok('Switching costs protect the franchise.'), erosionRisks: [nf] },
  management: [nf],
  capitalAllocation: [nf],
  risks: [ok('Client concentration is a risk.'), nf],
  thesis: ok('A durable services franchise. Returns on capital are high.'),
  killCriteria: [kill(), kill({ metric: 'debt_to_equity', threshold: 0.8, description: 'Debt/equity above 0.8' , operator: '>' })],
});

describe('numbersIn', () => {
  it('normalises Indian grouping and ignores lone digits', () => {
    expect(numbersIn('₹2,40,893 crore in 46 countries, 3 risks, 5% up')).toEqual(['240893', '46', '5']);
  });
});

describe('validateMemo', () => {
  it('accepts a fully cited memo', () => {
    expect(validateMemo(good(), sources).ok).toBe(true);
  });

  it('rejects an uncited claim', () => {
    const m = good();
    m.business = [{ text: 'It is a great company.', citations: [], notFound: false }];
    const r = validateMemo(m, sources);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0].message).toMatch(/Uncited claim/);
  });

  it('rejects a fabricated quote', () => {
    const m = good();
    m.business = [ok('It sells IT services.', cite('AR1-01', 'operates in 90 countries worldwide'))];
    const r = validateMemo(m, sources);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0].message).toMatch(/verbatim/);
  });

  it('rejects an unknown source id', () => {
    const m = good();
    m.business = [ok('x claim here', cite('ZZ-99', 'whatever quote here'))];
    const r = validateMemo(m, sources);
    expect(!r.ok && r.issues[0].message).toMatch(/Unknown source id/);
  });

  it('rejects a number that is not in the cited quote', () => {
    const m = good();
    m.business = [ok('Revenue was ₹3,00,000 crore.', cite('AR1-01', 'Revenue was ₹2,40,893 crore in FY2025'))];
    const r = validateMemo(m, sources);
    expect(!r.ok && r.issues.some((i) => i.message.includes('300000'))).toBe(true);
  });

  it('accepts a number that is in the cited quote, despite comma style', () => {
    const m = good();
    m.business = [ok('Revenue was 240893 crore.', cite('AR1-01', 'Revenue was ₹2,40,893 crore in FY2025'))];
    expect(validateMemo(m, sources).ok).toBe(true);
  });

  it('lets a fact be cited for a figure', () => {
    const m = good();
    m.risks = [ok('Returns are high at 59.3%.', cite('F1', '5-year average ROCE: avg 59.3%')), nf];
    expect(validateMemo(m, sources).ok).toBe(true);
  });

  it('forbids figures or citations on a "not found" claim', () => {
    const m = good();
    m.management = [{ text: 'Pay was 5% of profit', citations: [], notFound: true }];
    expect(validateMemo(m, sources).ok).toBe(false);
  });

  it('rejects trade-call language', () => {
    const m = good();
    m.thesis = ok('You should buy the stock. It is cheap.');
    const r = validateMemo(m, sources);
    expect(!r.ok && r.issues.some((i) => /Trade-call/.test(i.message))).toBe(true);
  });

  it('rejects a thesis longer than three sentences', () => {
    const m = good();
    m.thesis = ok('One. Two. Three. Four.');
    expect(validateMemo(m, sources).ok).toBe(false);
  });

  it('rejects an unmeasurable or out-of-range kill criterion', () => {
    const m = good();
    m.killCriteria = [kill({ threshold: 500 }), kill()];
    expect(validateMemo(m, sources).ok).toBe(false);
    const bad = good();
    (bad.killCriteria[0] as { metric: string }).metric = 'vibes';
    expect(validateMemo(bad, sources).ok).toBe(false);
  });

  it('requires at least two kill criteria', () => {
    const m = good();
    m.killCriteria = [kill()];
    expect(validateMemo(m, sources).ok).toBe(false);
  });
});
