'use client';

import { DICTATION_LANGUAGES, type Preferences } from '@/lib/preferences/schema';
import { GO_TO_SHORTCUTS } from '@/lib/shortcuts/shortcuts';
import { usePreferences } from './usePreferenceSaver';
import styles from './Settings.module.css';

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className={styles.switch} onClick={() => onChange(!checked)} />;
}

function Row({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <p className={styles.rowLabel}>{label}</p>
        <p className={styles.rowHint}>{hint}</p>
      </div>
      {children}
    </div>
  );
}

const LANGUAGE_LABELS: Record<(typeof DICTATION_LANGUAGES)[number], string> = {
  auto: 'Match my browser',
  'en-IN': 'English (India)',
  'en-US': 'English (US)',
  'en-GB': 'English (UK)',
  'hi-IN': 'Hindi',
};

/** The three preference-backed sections share one saver so a failed save rolls back cleanly. */
export function PreferencesSections({ initial }: { initial: Preferences }) {
  const { prefs, save, error, saved } = usePreferences(initial);
  const status = error ? <p className={`${styles.status} ${styles.error}`} role="alert">{error}</p> : saved ? <p className={styles.status} role="status">Saved</p> : null;

  return (
    <>
      <section id="chat" className={styles.section} aria-labelledby="chat-title">
        <h2 id="chat-title" className={styles.sectionTitle}>Mitra chat</h2>
        <p className={styles.sectionIntro}>How the full-page chat behaves. These apply the next time you open or send in the chat.</p>
        <div className={styles.rows}>
          <Row label="Let Mitra read my platform data" hint="Lets Mitra fetch your holdings, alerts, notes, news and stock data to ground its answers. Read-only. Turn off to make it answer without looking anything up.">
            <Switch label="Let Mitra read my platform data" checked={prefs.chat.platformAccess} onChange={(v) => void save({ chat: { platformAccess: v } })} />
          </Row>
          <Row label="Send with Enter" hint="On: Enter sends, Shift+Enter adds a new line. Off: Ctrl/Cmd+Enter sends and Enter adds a new line.">
            <Switch label="Send with Enter" checked={prefs.chat.sendOnEnter} onChange={(v) => void save({ chat: { sendOnEnter: v } })} />
          </Row>
          <Row label="Show tool activity" hint="Small chips like “Ran the screener” under a reply, showing what Mitra looked up.">
            <Switch label="Show tool activity" checked={prefs.chat.showToolActivity} onChange={(v) => void save({ chat: { showToolActivity: v } })} />
          </Row>
          <Row label="Dictation language" hint="Language used by the microphone button. Your browser handles the speech recognition.">
            <select className={styles.select} aria-label="Dictation language" value={prefs.chat.dictationLanguage} onChange={(e) => void save({ chat: { dictationLanguage: e.target.value as Preferences['chat']['dictationLanguage'] } })}>
              {DICTATION_LANGUAGES.map((l) => (
                <option key={l} value={l}>{LANGUAGE_LABELS[l]}</option>
              ))}
            </select>
          </Row>
        </div>
        {status}
      </section>

      <section id="display" className={styles.section} aria-labelledby="display-title">
        <h2 id="display-title" className={styles.sectionTitle}>Display</h2>
        <p className={styles.sectionIntro}>Privacy-friendly defaults for when you are working in public.</p>
        <div className={styles.rows}>
          <Row label="Hide portfolio values by default" hint="Starts every session with amounts hidden. The ₹ button in the top bar still toggles them.">
            <Switch label="Hide portfolio values by default" checked={prefs.display.hideValuesByDefault} onChange={(v) => void save({ display: { hideValuesByDefault: v } })} />
          </Row>
        </div>
      </section>

      <section id="shortcuts" className={styles.section} aria-labelledby="shortcuts-title">
        <h2 id="shortcuts-title" className={styles.sectionTitle}>Keyboard shortcuts</h2>
        <p className={styles.sectionIntro}>Press ? anywhere in the app to see this list.</p>
        <div className={styles.rows}>
          <Row label="Enable keyboard shortcuts" hint="Turns the global shortcuts below on or off. Typing in a field never triggers them.">
            <Switch label="Enable keyboard shortcuts" checked={prefs.shortcuts.enabled} onChange={(v) => void save({ shortcuts: { enabled: v } })} />
          </Row>
        </div>
        <ul className={styles.kbdList}>
          <li><span>Search</span><span className={styles.kbd}>Ctrl/⌘ K</span></li>
          <li><span>Shortcut help</span><span className={styles.kbd}>?</span></li>
          {GO_TO_SHORTCUTS.map((s) => (
            <li key={s.key}><span>Go to {s.label}</span><span className={styles.kbd}>G then {s.key.toUpperCase()}</span></li>
          ))}
        </ul>
      </section>
    </>
  );
}
