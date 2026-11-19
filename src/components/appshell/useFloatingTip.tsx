'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import styles from './FloatingTip.module.css';

/** Gap between a control and its tip, in px. */
const GAP_PX = 10;
/** Keep a tip this far from the window's edge, in px. */
const EDGE_PX = 8;

type Place = 'right' | 'below';

interface Shown {
  label: string;
  hint?: string;
  place: Place;
  left?: number;
  top: number;
  right?: number;
}

interface Options {
  place: Place;
  /** How long the pointer must rest on a control before its tip shows (keyboard focus shows it at once). */
  delayMs?: number;
  /** Switch the tips off, e.g. an expanded sidebar whose labels are already on screen. */
  enabled?: boolean;
}

type TipEvent = MouseEvent<HTMLElement> | FocusEvent<HTMLElement>;

/**
 * Tips for the site's own navigation (#269, #271), drawn on the page through a portal with fixed coordinates so no ancestor's overflow
 * can clip them. `tipProps(label, hint)` gives the handlers to spread on a control; render `tip` once, anywhere in the component.
 */
export function useFloatingTip({ place, delayMs = 0, enabled = true }: Options): {
  tip: ReactNode;
  tipProps: (label: string, hint?: string) => Record<string, unknown>;
} {
  const [shown, setShown] = useState<Shown | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const hide = useCallback(() => {
    clearTimeout(timer.current);
    setShown(null);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  const show = (e: TipEvent, label: string, hint?: string) => {
    if (!enabled) return;
    const byKeyboard = e.type === 'focus';
    // Hover only on a real pointer (on touch it would stick after a tap); focus only from the keyboard.
    if (
      byKeyboard
        ? !e.currentTarget.matches(':focus-visible')
        : !window.matchMedia('(hover: hover)').matches
    )
      return;
    const target = e.currentTarget;
    clearTimeout(timer.current);
    const place_ = () => {
      const r = target.getBoundingClientRect();
      setShown(
        place === 'right'
          ? { label, hint, place, left: r.right + GAP_PX, top: r.top + r.height / 2 }
          : {
              label,
              hint,
              place,
              top: r.bottom + GAP_PX - 2,
              right: Math.max(EDGE_PX, window.innerWidth - r.right),
            },
      );
    };
    if (byKeyboard || delayMs === 0) place_();
    else timer.current = setTimeout(place_, delayMs);
  };

  const tipProps = (label: string, hint?: string) => ({
    onMouseEnter: (e: MouseEvent<HTMLElement>) => show(e, label, hint),
    onFocus: (e: FocusEvent<HTMLElement>) => show(e, label, hint),
    onMouseLeave: hide,
    onBlur: hide,
    // Clicking opens the control's own menu or page, which the tip would sit on top of.
    onMouseDown: hide,
  });

  // A tip switched off while showing (the sidebar expanding) is simply not drawn.
  const tip =
    enabled && shown
      ? createPortal(
          <span
            className={`${styles.tip} ${shown.place === 'right' ? styles.right : ''}`}
            role="tooltip"
            style={{ left: shown.left, top: shown.top, right: shown.right }}
          >
            <span className={styles.label}>{shown.label}</span>
            {shown.hint && <span className={styles.hint}>{shown.hint}</span>}
          </span>,
          document.body,
        )
      : null;

  return { tip, tipProps };
}
