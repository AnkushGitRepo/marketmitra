'use client';

import { SCREENER_RANGE_FIELDS, type ScreenerFacets } from '@/lib/dashboard/screenerSchema';
import { rangeKey, type Draft, type RangeKey } from '@/lib/screener/draft';
import { FILTER_GROUPS } from '@/lib/screener/presets';
import styles from './FilterFields.module.css';

export type DraftKey = RangeKey | 'sector' | 'industry' | 'q';

interface FilterFieldsProps {
  readonly draft: Draft;
  readonly facets: ScreenerFacets;
  /** Industries valid for the selected sector (falls back to all). */
  readonly industries: readonly string[];
  readonly onChange: (key: DraftKey, value: string) => void;
  /** Search, sector and industry. Hidden on desktop, where they live in the toolbar. */
  readonly includeBasics?: boolean;
}

const fieldsByKey = new Map(SCREENER_RANGE_FIELDS.map((f) => [f.key, f]));
const optionLabel = (name: string, counts?: Record<string, number>): string => (counts?.[name] ? `${name} (${counts[name]})` : name);

/** The Min/Max grid (and optionally search + sector + industry). Used in the desktop accordion and the mobile sheet. */
export function FilterFields({ draft, facets, industries, onChange, includeBasics = false }: FilterFieldsProps) {
  return (
    <div className={styles.root}>
      {includeBasics && (
        <div className={styles.basics}>
          <label className={styles.field}>
            <span className={styles.label}>Company or symbol</span>
            <input
              className={styles.input}
              type="search"
              placeholder="e.g. Tata, HDFC, INFY"
              maxLength={64}
              value={draft.q}
              onChange={(e) => onChange('q', e.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Sector</span>
            <select className={styles.input} value={draft.sector} onChange={(e) => onChange('sector', e.target.value)}>
              <option value="">All sectors{facets.sectors.length ? ` (${facets.sectors.length})` : ''}</option>
              {facets.sectors.map((s) => (
                <option key={s} value={s}>
                  {optionLabel(s, facets.sector_counts)}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Industry</span>
            <select className={styles.input} value={draft.industry} onChange={(e) => onChange('industry', e.target.value)}>
              <option value="">{draft.sector ? 'All in this sector' : 'All industries'}</option>
              {industries.map((i) => (
                <option key={i} value={i}>
                  {optionLabel(i, facets.industry_counts)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className={styles.groups}>
        {FILTER_GROUPS.map((group) => (
          <fieldset key={group.title} className={styles.group}>
            <legend className={styles.legend}>{group.title}</legend>
            <div className={styles.groupFields}>
              {group.fields.map((key) => {
                const field = fieldsByKey.get(key);
                if (!field) return null;
                return (
                  <div key={key} className={styles.field}>
                    <span className={styles.label}>
                      {field.label}
                      {field.unit ? ` (${field.unit})` : ''}
                    </span>
                    <div className={styles.range}>
                      <input
                        className={styles.input}
                        type="number"
                        step="any"
                        inputMode="decimal"
                        placeholder="Min"
                        aria-label={`${field.label} minimum`}
                        value={draft[rangeKey(key, 'min')] ?? ''}
                        onChange={(e) => onChange(rangeKey(key, 'min'), e.target.value)}
                      />
                      <span className={styles.sep} aria-hidden="true">
                        –
                      </span>
                      <input
                        className={styles.input}
                        type="number"
                        step="any"
                        inputMode="decimal"
                        placeholder="Max"
                        aria-label={`${field.label} maximum`}
                        value={draft[rangeKey(key, 'max')] ?? ''}
                        onChange={(e) => onChange(rangeKey(key, 'max'), e.target.value)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
    </div>
  );
}
