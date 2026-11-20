'use client';

import { useId, useState } from 'react';
import { subCategoryOptions, type Draft, type DraftKey, type FilterChip } from '@/lib/funds/draft';
import type { FundFilters, FundPlan } from '@/lib/funds/params';
import type { FundFacets } from '@/lib/funds/types';
import styles from './FundsToolbar.module.css';

interface FundsToolbarProps {
  readonly draft: Draft;
  readonly plan: FundPlan;
  readonly facets: FundFacets;
  readonly chips: readonly FilterChip[];
  readonly error: string | null;
  readonly onChange: (key: DraftKey, value: string) => void;
  readonly onPlanChange: (plan: FundPlan) => void;
  readonly onRemoveChip: (chip: FilterChip) => void;
  readonly onClear: () => void;
}

/** Filters that live in the "More filters" panel, so its button can say how many are active. */
const PANEL_KEYS: readonly (keyof FundFilters)[] = [
  'sub_category', 'fund_house', 'option', 'min_aum_cr', 'min_ret_1y', 'min_ret_3y', 'min_ret_5y',
  'min_sharpe_3y', 'max_std_dev_3y', 'max_fall_3y', 'max_expense_ratio',
];

interface NumberFieldDef {
  readonly key: DraftKey;
  readonly label: string;
  readonly placeholder: string;
}

const NUMBER_FIELDS: readonly NumberFieldDef[] = [
  { key: 'min_ret_1y', label: 'Min 1Y return %', placeholder: 'e.g. 10' },
  { key: 'min_ret_3y', label: 'Min 3Y return %', placeholder: 'e.g. 15' },
  { key: 'min_ret_5y', label: 'Min 5Y return %', placeholder: 'e.g. 15' },
  { key: 'min_sharpe_3y', label: 'Min Sharpe', placeholder: 'e.g. 0.5' },
  { key: 'max_std_dev_3y', label: 'Max volatility %', placeholder: 'e.g. 15' },
  { key: 'max_fall_3y', label: 'Max worst fall %', placeholder: 'e.g. 20' },
  { key: 'max_expense_ratio', label: 'Max expense ratio %', placeholder: 'e.g. 1' },
];

export function FundsToolbar({
  draft, plan, facets, chips, error, onChange, onPlanChange, onRemoveChip, onClear,
}: FundsToolbarProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const subCategories = subCategoryOptions(facets.sub_categories, draft.category);
  const panelCount = chips.filter((chip) => chip.keys.some((key) => PANEL_KEYS.includes(key))).length;

  return (
    <section className={styles.toolbar} aria-label="Fund filters">
      <div className={styles.mainRow}>
        <label className={`${styles.field} ${styles.search}`}>
          <span className={styles.label}>Search</span>
          <input
            className={styles.input}
            type="search"
            value={draft.q}
            maxLength={80}
            placeholder="Fund name, e.g. Nifty 50 Index"
            onChange={(e) => onChange('q', e.target.value)}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Category</span>
          <select className={styles.input} value={draft.category} onChange={(e) => onChange('category', e.target.value)}>
            <option value="">All categories</option>
            {facets.categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>

        <div className={styles.field} role="group" aria-label="Plan">
          <span className={styles.label}>Plan</span>
          <div className={styles.segment}>
            {(['direct', 'regular'] as const).map((p) => (
              <button
                key={p}
                type="button"
                className={`${styles.segBtn} ${plan === p ? styles.segActive : ''}`}
                aria-pressed={plan === p}
                onClick={() => onPlanChange(p)}
              >
                {p === 'direct' ? 'Direct' : 'Regular'}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          className={styles.moreBtn}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
        >
          More filters{panelCount > 0 ? ` (${panelCount})` : ''}
          <span aria-hidden="true"> {open ? '▲' : '▼'}</span>
        </button>
      </div>

      <div id={panelId} className={styles.panel} hidden={!open}>
        <label className={styles.field}>
          <span className={styles.label}>Sub-category</span>
          <select className={styles.input} value={draft.sub_category} onChange={(e) => onChange('sub_category', e.target.value)}>
            <option value="">All</option>
            {subCategories.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Fund house</span>
          <select className={styles.input} value={draft.fund_house} onChange={(e) => onChange('fund_house', e.target.value)}>
            <option value="">All fund houses</option>
            {facets.fund_houses.map((h) => (
              <option key={h} value={h}>{h.replace(/ Mutual Fund$/, '')}</option>
            ))}
          </select>
        </label>

        {NUMBER_FIELDS.map((field) => (
          <label key={field.key} className={styles.field}>
            <span className={styles.label}>{field.label}</span>
            <input
              className={styles.input}
              type="text"
              inputMode="decimal"
              value={draft[field.key]}
              placeholder={field.placeholder}
              onChange={(e) => onChange(field.key, e.target.value)}
            />
          </label>
        ))}
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {chips.length > 0 && (
        <div className={styles.footer}>
          {chips.map((chip) => (
            <span key={`${chip.keys.join('+')}:${chip.label}`} className={styles.chip}>
              {chip.label}
              <button type="button" className={styles.chipX} aria-label={`Remove filter ${chip.label}`} onClick={() => onRemoveChip(chip)}>
                ×
              </button>
            </span>
          ))}
          <button type="button" className={styles.clear} onClick={onClear}>
            Clear all
          </button>
        </div>
      )}
    </section>
  );
}
