'use client';

import { useMask } from '@/lib/dashboard/MaskContext';
import { DICTATION_LANGUAGES, type Preferences, type PreferencesPatch } from '@/lib/preferences/schema';
import { GO_TO_SHORTCUTS, OPEN_SHORTCUTS_EVENT } from '@/lib/shortcuts/shortcuts';
import rowStyles from '@/app/(app)/settings/Settings.module.css';
import styles from './PreferencesPanel.module.css';

const LANGUAGE_LABELS: Record<(typeof DICTATION_LANGUAGES)[number], string> = {
  auto: 'Match my browser',
  'en-IN': 'English (India)',
  'en-US': 'English (US)',
  'en-GB': 'English (UK)',
  'hi-IN': 'Hindi',
};

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className={rowStyles.switch} onClick={() => onChange(!checked)} />;
}

function Row({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className={rowStyles.row}>
      <div className={rowStyles.rowText}>
        <p className={rowStyles.rowLabel}>{label}</p>
        <p className={rowStyles.rowHint}>{hint}</p>
      </div>
      {children}
    </div>
  );
}

interface PreferencesPanelProps {
  readonly prefs: Preferences;
  readonly onPrefs: (patch: PreferencesPatch) => void;
  readonly error: string | null;
  readonly saved: boolean;
}

/** Display, chat input and keyboard settings. The shortcut list itself lives in the `?` sheet, not on this page. */
export function PreferencesPanel({ prefs, onPrefs, error, saved }: PreferencesPanelProps) {
  const { masked, setMasked } = useMask();

  return (
    <div className={styles.root}>
      <section className={rowStyles.section} aria-labelledby="display-title">
        <h2 id="display-title" className={rowStyles.sectionTitle}>
          Display &amp; privacy
        </h2>
        <p className={rowStyles.sectionIntro}>Privacy-friendly defaults for when you are working in public.</p>
        <div className={rowStyles.rows}>
          <Row label="Hide portfolio values by default" hint="Starts every session with amounts hidden. The ₹ button in the top bar still toggles them.">
            <Switch
              label="Hide portfolio values by default"
              checked={prefs.display.hideValuesByDefault}
              onChange={(v) => {
                onPrefs({ display: { hideValuesByDefault: v } });
                // Preview it now: the values on screen follow the switch, so you can see what it does.
                setMasked(v);
              }}
            />
          </Row>
        </div>
        <p className={styles.preview} aria-live="polite">
          Right now amounts are <strong>{masked ? 'hidden' : 'visible'}</strong> on this device.
        </p>
      </section>

      <section className={rowStyles.section} aria-labelledby="chat-title">
        <h2 id="chat-title" className={rowStyles.sectionTitle}>
          Chat input
        </h2>
        <p className={rowStyles.sectionIntro}>How typing and dictation behave in the Mitra chat. These apply the next time you open or send in the chat.</p>
        <div className={rowStyles.rows}>
          <Row label="Send with Enter" hint="On: Enter sends, Shift+Enter adds a new line. Off: Ctrl/Cmd+Enter sends and Enter adds a new line.">
            <Switch label="Send with Enter" checked={prefs.chat.sendOnEnter} onChange={(v) => onPrefs({ chat: { sendOnEnter: v } })} />
          </Row>
          <Row label="Dictation language" hint="Language used by the microphone button. Your browser handles the speech recognition.">
            <select
              className={rowStyles.select}
              aria-label="Dictation language"
              value={prefs.chat.dictationLanguage}
              onChange={(e) => onPrefs({ chat: { dictationLanguage: e.target.value as Preferences['chat']['dictationLanguage'] } })}
            >
              {DICTATION_LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {LANGUAGE_LABELS[l]}
                </option>
              ))}
            </select>
          </Row>
        </div>
      </section>

      <section className={rowStyles.section} aria-labelledby="shortcuts-title">
        <h2 id="shortcuts-title" className={rowStyles.sectionTitle}>
          Keyboard shortcuts
        </h2>
        <p className={rowStyles.sectionIntro}>Search with Ctrl/⌘ K, jump between pages with G then {GO_TO_SHORTCUTS.map((s) => s.key.toUpperCase()).join(' / ')}.</p>
        <div className={rowStyles.rows}>
          <Row label="Enable keyboard shortcuts" hint="Turns the global shortcuts on or off. Typing in a field never triggers them.">
            <Switch label="Enable keyboard shortcuts" checked={prefs.shortcuts.enabled} onChange={(v) => onPrefs({ shortcuts: { enabled: v } })} />
          </Row>
        </div>
        <button type="button" className={styles.link} onClick={() => window.dispatchEvent(new Event(OPEN_SHORTCUTS_EVENT))}>
          View all shortcuts <span aria-hidden="true">(or press ?)</span>
        </button>
      </section>

      {error ? (
        <p className={`${rowStyles.status} ${rowStyles.error}`} role="alert">
          {error}
        </p>
      ) : saved ? (
        <p className={rowStyles.status} role="status">
          Saved
        </p>
      ) : null}
    </div>
  );
}
