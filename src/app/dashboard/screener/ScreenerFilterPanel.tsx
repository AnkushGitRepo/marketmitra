'use client';

import { SCREENER_RANGE_FIELDS, type ScreenerFacets } from '@/lib/dashboard/screenerSchema';
import { FILTER_GROUPS, SCREENER_PRESETS, type ScreenerPreset } from '@/lib/screener/presets';
import { rangeKey, type Draft, type RangeKey } from '@/lib/screener/draft';
import styles from './page.module.css';

interface ScreenerFilterPanelProps {
  draft: Draft;
  facets: ScreenerFacets;
  /** Industries valid for the selected sector (falls back to all). */
  industries: string[];
  error: string | null;
  loading: boolean;
  fundamentalsReady: boolean;
  activePresetId: string | null;
  onChange: (key: RangeKey | 'sector' | 'industry' | 'q', value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onReset: () => void;
  onPreset: (preset: ScreenerPreset) => void;
}

const fieldsByKey = new Map(SCREENER_RANGE_FIELDS.map((f) => [f.key, f]));

function optionLabel(name: string, counts?: Record<string, number>): string {
  return counts?.[name] ? `${name} (${counts[name]})` : name;
}

export function ScreenerFilterPanel({
  draft,
  facets,
  industries,
  error,
  loading,
  fundamentalsReady,
  activePresetId,
  onChange,
  onSubmit,
  onReset,
  onPreset,
}: ScreenerFilterPanelProps) {
  return (
    <form className={styles.formCard} onSubmit={onSubmit}>
      <div className={styles.presetRow} role="group" aria-label="Quick screens">
        <span className={styles.presetLabel}>Quick screens</span>
        {SCREENER_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`${styles.presetChip} ${activePresetId === preset.id ? styles.presetChipActive : ''}`}
            title={
              preset.needsFundamentals && !fundamentalsReady
                ? `${preset.description} — uses scraped fundamentals, so it only covers companies scraped so far`
                : preset.description
            }
            disabled={loading}
            onClick={() => onPreset(preset)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className={styles.searchRow}>
        <label className={`${styles.field} ${styles.fieldWide}`}>
          <span className={styles.fieldLabel}>Company or symbol</span>
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
          <span className={styles.fieldLabel}>Sector</span>
          <select
            className={styles.select}
            value={draft.sector}
            onChange={(e) => onChange('sector', e.target.value)}
          >
            <option value="">
              All sectors{facets.sectors.length ? ` (${facets.sectors.length})` : ''}
            </option>
            {facets.sectors.map((s) => (
              <option key={s} value={s}>
                {optionLabel(s, facets.sector_counts)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Industry</span>
          <select
            className={styles.select}
            value={draft.industry}
            onChange={(e) => onChange('industry', e.target.value)}
          >
            <option value="">{draft.sector ? 'All in this sector' : 'All industries'}</option>
            {industries.map((i) => (
              <option key={i} value={i}>
                {optionLabel(i, facets.industry_counts)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {facets.sectors.length === 0 && (
        <p className={styles.hint}>
          Sector and industry come from the fundamentals scrape and appear as companies are covered.
        </p>
      )}

      <div className={styles.groups}>
        {FILTER_GROUPS.map((group) => (
          <fieldset key={group.title} className={styles.group}>
            <legend className={styles.groupTitle}>{group.title}</legend>
            <div className={styles.groupFields}>
              {group.fields.map((key) => {
                const field = fieldsByKey.get(key);
                if (!field) return null;
                return (
                  <div key={key} className={styles.field}>
                    <span className={styles.fieldLabel}>
                      {field.label}
                      {field.unit ? ` (${field.unit})` : ''}
                    </span>
                    <div className={styles.rangeInputs}>
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
                      <span className={styles.rangeSep}>–</span>
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

      {error && (
        <p className={styles.formError} role="alert">
          {error}
        </p>
      )}

      <div className={styles.formActions}>
        <button type="button" className={styles.btnSecondary} onClick={onReset} disabled={loading}>
          Clear all
        </button>
        <button type="submit" className={styles.btnPrimary} disabled={loading}>
          {loading ? 'Screening…' : 'Apply filters'}
        </button>
      </div>
    </form>
  );
}
