// Pure logic for the dictation help dialog. Web pages cannot open the browser's own
// settings screen (a browser security rule), so the closest we can get is detecting
// *why* the mic is unavailable and showing the exact steps for the user's browser.

export type Browser = 'chrome' | 'edge' | 'brave' | 'safari' | 'firefox' | 'other';

export type MicProblem = 'denied' | 'insecure' | 'no-device' | 'speech-unavailable';

export interface MicGuidance {
  readonly title: string;
  readonly steps: readonly string[];
  /** When true the dialog offers "Try again" (the user can fix it without leaving the page). */
  readonly canRetry: boolean;
}

export function detectBrowser(userAgent: string, isBrave = false): Browser {
  if (isBrave) return 'brave';
  if (/Edg\//.test(userAgent)) return 'edge';
  if (/Firefox\//.test(userAgent)) return 'firefox';
  if (/Chrome\/|Chromium\/|CriOS\//.test(userAgent)) return 'chrome';
  if (/Safari\//.test(userAgent) && /Version\//.test(userAgent)) return 'safari';
  return 'other';
}

/** Maps a SpeechRecognition `error` code (plus what we know about the browser) to a problem, or null if it is not a permission-style failure. */
export function problemForSpeechError(code: string, browser: Browser): MicProblem | null {
  if (code === 'not-allowed' || code === 'service-not-allowed') return 'denied';
  if (code === 'audio-capture') return 'no-device';
  // Brave ships the API but strips Google's speech service, so it fails with `network`.
  if (code === 'network' && browser === 'brave') return 'speech-unavailable';
  return null;
}

/** Maps a getUserMedia DOMException name to a problem. */
export function problemForMediaError(name: string): MicProblem {
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'no-device';
  return 'denied';
}

const OS_STEP =
  'Still blocked? Your operating system may be blocking the browser: on macOS open System Settings > Privacy & Security > Microphone and switch your browser on; on Windows open Settings > Privacy & security > Microphone.';

const ADDRESS_BAR: Record<'chrome' | 'edge', readonly string[]> = {
  chrome: [
    'Click the settings icon (or padlock) at the left end of the address bar, just before the web address.',
    'Open Permissions (or Site settings) and find Microphone.',
    'Change Microphone to Allow. This page notices the change by itself and starts dictation.',
  ],
  edge: [
    'Click the padlock at the left end of the address bar, just before the web address.',
    'Open Permissions for this site and find Microphone.',
    'Change Microphone to Allow. This page notices the change by itself and starts dictation.',
  ],
};

export function micGuidance(problem: MicProblem, browser: Browser): MicGuidance {
  if (problem === 'insecure') {
    return {
      title: 'Dictation needs a secure connection',
      steps: ['Browsers only allow the microphone on https:// pages or on localhost.', 'Open MarketMitra over https:// (or http://localhost) and try again.'],
      canRetry: false,
    };
  }
  if (problem === 'no-device') {
    return {
      title: 'No microphone found',
      steps: ['Connect a microphone or headset, or check it is not in use by another app.', 'Then press Try again.', OS_STEP],
      canRetry: true,
    };
  }
  if (problem === 'speech-unavailable') {
    return {
      title: browser === 'brave' ? "Brave doesn't include speech-to-text" : 'Speech-to-text is unavailable here',
      steps: ['Dictation uses your browser’s built-in speech service, which this browser does not provide.', 'Use Chrome, Edge or Safari for dictation, or type your message.'],
      canRetry: false,
    };
  }

  // denied
  if (browser === 'chrome' || browser === 'edge') {
    return { title: 'Allow the microphone for this site', steps: [...ADDRESS_BAR[browser], OS_STEP], canRetry: true };
  }
  if (browser === 'brave') {
    return {
      title: 'Allow the microphone for this site',
      steps: [
        'Click the padlock at the left end of the address bar, just before the web address.',
        'Open Site settings and find Microphone.',
        'Change Microphone to Allow. This page notices the change by itself.',
        'Note: Brave may not provide speech-to-text even when allowed. If it fails, use Chrome, Edge or Safari.',
        OS_STEP,
      ],
      canRetry: true,
    };
  }
  if (browser === 'safari') {
    return {
      title: 'Allow the microphone for this site',
      steps: [
        'In the menu bar choose Safari > Settings for This Website… (or Safari > Settings > Websites > Microphone).',
        'Set Microphone to Allow for this site.',
        'Then press Try again.',
        OS_STEP,
      ],
      canRetry: true,
    };
  }
  return {
    title: 'Allow the microphone for this site',
    steps: ['Open your browser’s site settings for this page (usually the icon at the left of the address bar).', 'Set Microphone to Allow, then press Try again.', OS_STEP],
    canRetry: true,
  };
}
