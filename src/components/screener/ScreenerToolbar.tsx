'use client';

import { useState } from 'react';
import type { ScreenerFacets } from '@/lib/dashboard/screenerSchema';
import type { ActiveFilter, Draft } from '@/lib/screener/draft';
import { SCREENER_PRESETS, type ScreenerPreset } from '@/lib/screener/presets';
import { FilterFields, type DraftKey } from './FilterFields';
import styles from './ScreenerToolbar.module.css';

interface ScreenerToolbarProps {
  readonly draft: Draft;
  readonly facets: ScreenerFacets;
  readonly industries: readonly string[];
  readonly chips: readonly ActiveFilter[];
  readonly activePresetId: string | null;
  readonly fundamentalsReady: boolean;
  readonly loading: boolean;
  readonly error: string | null;
  readonly onChange: (key: DraftKey, value: string) => void;
  readonly onPreset: (preset: ScreenerPreset) => void;
  readonly onRemoveChip: (keys: ActiveFilter['keys']) => void;
  readonly onClear: () => void;
}

/** Presets, search, sector and a "More filters" accordion on desktop; presets and chips only on phones (filters live in the bottom sheet). */
export function ScreenerToolbar({
  draft,
  facets,
  industries,
  chips,
  activePresetId,
  fundamentalsReady,
  loading,
  error,
  onChange,
  onPreset,
  onRemoveChip,
  onClear,
}: ScreenerToolbarProps) {
  const [expanded, setExpanded] = useState(false);
  const detailCount = chips.filter((c) => c.id !== 'q' && c.id !== 'sector' && c.id !== 'industry').length;

  return (
    <section className={styles.card} aria-label="Screener filters">
      <div className={styles.presets} role="group" aria-label="Quick screens">
        {SCREENER_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            aria-pressed={activePresetId === preset.id}
            className={`${styles.preset} ${activePresetId === preset.id ? styles.presetActive : ''}`}
            title={
              preset.needsFundamentals && !fundamentalsReady
                ? `${preset.description} — uses scraped fundamentals, so it only covers companies scraped so far`
                : preset.description
            }
            onClick={() => onPreset(preset)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className={styles.primary}>
        <label className={`${styles.control} ${styles.search}`}>
          <span className={styles.srOnly}>Company or symbol</span>
          <input
            className={styles.input}
            type="search"
            placeholder="Search company or symbol"
            maxLength={64}
            value={draft.q}
            onChange={(e) => onChange('q', e.target.value)}
          />
        </label>
        <label className={styles.control}>
          <span className={styles.srOnly}>Sector</span>
          <select className={styles.input} value={draft.sector} onChange={(e) => onChange('sector', e.target.value)}>
            <option value="">All sectors{facets.sectors.length ? ` (${facets.sectors.length})` : ''}</option>
            {facets.sectors.map((s) => (
              <option key={s} value={s}>
                {facets.sector_counts?.[s] ? `${s} (${facets.sector_counts[s]})` : s}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={`${styles.more} ${expanded ? styles.moreOpen : ''}`}
          aria-expanded={expanded}
          aria-controls="screener-more-filters"
          onClick={() => setExpanded((e) => !e)}
        >
          More filters{detailCount > 0 ? ` (${detailCount})` : ''} <span aria-hidden="true">{expanded ? '▴' : '▾'}</span>
        </button>
      </div>

      {expanded && (
        <div id="screener-more-filters" className={styles.expanded}>
          <div className={styles.industry}>
            <label className={styles.control}>
              <span className={styles.industryLabel}>Industry</span>
              <select className={styles.input} value={draft.industry} onChange={(e) => onChange('industry', e.target.value)}>
                <option value="">{draft.sector ? 'All in this sector' : 'All industries'}</option>
                {industries.map((i) => (
                  <option key={i} value={i}>
                    {facets.industry_counts?.[i] ? `${i} (${facets.industry_counts[i]})` : i}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <FilterFields draft={draft} facets={facets} industries={industries} onChange={onChange} />
        </div>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {(chips.length > 0 || loading) && (
        <div className={styles.chips} aria-label="Applied filters">
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={styles.chip}
              onClick={() => onRemoveChip(chip.keys)}
              aria-label={`Remove filter ${chip.label}`}
            >
              {chip.label} <span aria-hidden="true">✕</span>
            </button>
          ))}
          {chips.length > 0 && (
            <button type="button" className={styles.clear} onClick={onClear}>
              Clear all
            </button>
          )}
          {loading && <span className={styles.updating}>Updating…</span>}
        </div>
      )}
    </section>
  );
}
