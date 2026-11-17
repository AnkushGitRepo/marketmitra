import { kindLabel } from '@/lib/analysts/format';
import type { Dispatch, DispatchItem } from '@/lib/analysts/dispatch';
import styles from './MorningBrief.module.css';

export interface BriefActions {
  readonly onAsk: (symbol: string, title: string) => void;
  readonly onDossier: (symbol: string) => void;
}

interface ItemListProps extends BriefActions {
  readonly heading: string;
  readonly tone: 'attention' | 'catalyst';
  readonly items: readonly DispatchItem[];
  /** Attention rows also offer the dossier; catalysts keep to one action. */
  readonly withDossier: boolean;
}

function ItemList({ heading, tone, items, withDossier, onAsk, onDossier }: ItemListProps) {
  if (items.length === 0) return null;
  return (
    <section aria-label={heading}>
      <h3 className={styles.h}>{heading}</h3>
      <ul className={styles.list}>
        {items.map((i, n) => (
          <li key={`${i.symbol}-${n}`} className={styles.item} data-tone={tone}>
            <div className={styles.itemHead}>
              <strong>{i.symbol}</strong>
              <span className={styles.kind}>{kindLabel(i.kind)}</span>
              {i.weightPct !== null && <span className={styles.weight}>{i.weightPct}% of portfolio</span>}
            </div>
            <p className={styles.itemTitle}>{i.title}</p>
            <div className={styles.itemActions}>
              <button type="button" className={styles.link} onClick={() => onAsk(i.symbol, i.title)}>
                Ask {i.symbol} analyst
              </button>
              {withDossier && (
                <button type="button" className={styles.link} onClick={() => onDossier(i.symbol)}>
                  View dossier
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Pulse({ d }: { readonly d: Dispatch }) {
  const needs = new Set(d.attention.map((i) => i.symbol)).size;
  const good = new Set(d.catalysts.map((i) => i.symbol).filter((s) => !d.attention.some((a) => a.symbol === s))).size;
  return (
    <section className={styles.pulse} aria-label="Summary">
      <p className={styles.pulseText}>{d.pulse}</p>
      <div className={styles.pills}>
        <span className={styles.pill} data-tone="attention">
          {needs} attention
        </span>
        <span className={styles.pill} data-tone="catalyst">
          {good} {good === 1 ? 'catalyst' : 'catalysts'}
        </span>
        <span className={styles.pill} data-tone="quiet">
          {d.quiet.length} quiet
        </span>
      </div>
    </section>
  );
}

function Quiet({ d }: { readonly d: Dispatch }) {
  if (d.quiet.length === 0) return null;
  return (
    <details className={styles.quiet}>
      <summary className={styles.quietSummary}>
        Quiet holdings ({d.quiet.length} {d.quiet.length === 1 ? 'analyst' : 'analysts'} · no material changes)
      </summary>
      <ul className={styles.quietList}>
        {d.quiet.map((q) => (
          <li key={q.symbol}>
            <strong>{q.symbol}</strong> {q.text}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** One brief, top to bottom: the pulse, what needs a look, good news, then the quiet holdings folded away. */
export function BriefSections({ d, onAsk, onDossier }: { readonly d: Dispatch } & BriefActions) {
  return (
    <div className={styles.view}>
      <Pulse d={d} />
      <ItemList heading="Requires attention" tone="attention" items={d.attention} withDossier onAsk={onAsk} onDossier={onDossier} />
      <ItemList heading="Catalysts and tailwinds" tone="catalyst" items={d.catalysts} withDossier={false} onAsk={onAsk} onDossier={onDossier} />
      <Quiet d={d} />
    </div>
  );
}
