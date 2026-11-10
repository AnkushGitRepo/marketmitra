'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  detectBrowser,
  problemForMediaError,
  problemForSpeechError,
  type Browser,
  type MicProblem,
} from '@/lib/mic/guidance';

// The Web Speech API isn't in lib.dom; only the surface we use is declared.
interface SpeechResultLike {
  readonly isFinal: boolean;
  readonly 0: { readonly transcript: string };
}
interface SpeechEventLike {
  readonly resultIndex: number;
  readonly results: ArrayLike<SpeechResultLike>;
}
interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => RecognitionLike;

function getCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noopSubscribe = () => () => {};

const MESSAGES: Record<string, string> = {
  'no-speech': "Didn't catch anything. Try again.",
  network: 'Dictation needs a network connection.',
};

export interface DictationHelp {
  readonly problem: MicProblem;
  readonly browser: Browser;
}

type PermissionState = 'granted' | 'denied' | 'prompt' | 'unknown';

async function microphonePermission(): Promise<{ state: PermissionState; status: PermissionStatus | null }> {
  try {
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    return { state: status.state, status };
  } catch {
    return { state: 'unknown', status: null }; // Safari/Firefox don't support querying the microphone
  }
}

/** Asks the browser for the mic once so the native permission prompt appears; the stream is closed straight away. */
async function requestMicrophone(): Promise<MicProblem | null> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return null;
  } catch (e) {
    return problemForMediaError(e instanceof DOMException ? e.name : '');
  }
}

async function detectCurrentBrowser(): Promise<Browser> {
  const brave = (navigator as Navigator & { brave?: { isBrave?: () => Promise<boolean> } }).brave;
  const isBrave = brave?.isBrave ? await brave.isBrave().catch(() => false) : false;
  return detectBrowser(navigator.userAgent, isBrave);
}

/**
 * Browser speech-to-text for the composer. Chrome and Safari stream the audio to
 * their own speech service, so the UI labels it; nothing is sent to MarketMitra.
 *
 * Starting dictation first checks the microphone permission: if it is undecided the
 * browser's native prompt is shown; if it was blocked, `help` is set so the UI can show
 * browser-specific steps, and dictation starts by itself once the user allows it.
 * `supported` is false on the server and in browsers without the API (e.g. Firefox).
 */
export function useDictation(onFinalText: (text: string) => void) {
  const supported = useSyncExternalStore(noopSubscribe, () => getCtor() !== null, () => false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [help, setHelp] = useState<DictationHelp | null>(null);
  const recognition = useRef<RecognitionLike | null>(null);
  const callback = useRef(onFinalText);
  useEffect(() => {
    callback.current = onFinalText;
  });
  useEffect(() => () => recognition.current?.stop(), []);

  const begin = useCallback((browser: Browser) => {
    const Ctor = getCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = navigator.language || 'en-IN';
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) callback.current(e.results[i][0].transcript.trim());
      }
    };
    rec.onerror = (e) => {
      const problem = problemForSpeechError(e.error, browser);
      if (problem) setHelp({ problem, browser });
      else setError(MESSAGES[e.error] ?? 'Dictation stopped unexpectedly.');
    };
    rec.onend = () => setListening(false);
    recognition.current = rec;
    rec.start();
    setListening(true);
  }, []);

  const start = useCallback(async () => {
    if (!getCtor()) return;
    setError(null);
    const browser = await detectCurrentBrowser();

    if (!window.isSecureContext) {
      setHelp({ problem: 'insecure', browser });
      return;
    }
    const { state } = await microphonePermission();
    if (state === 'denied') {
      setHelp({ problem: 'denied', browser });
      return;
    }
    if (state !== 'granted') {
      const problem = await requestMicrophone(); // shows the native prompt
      if (problem) {
        setHelp({ problem, browser });
        return;
      }
    }
    setHelp(null);
    begin(browser);
  }, [begin]);

  // While the help dialog is open for a denied mic, watch for the user allowing it
  // in the browser UI and carry on without them having to press anything.
  const helpProblem = help?.problem;
  useEffect(() => {
    if (helpProblem !== 'denied') return;
    let status: PermissionStatus | null = null;
    let cancelled = false;
    const onChange = () => {
      if (status?.state === 'granted' && !cancelled) void start();
    };
    void microphonePermission().then((r) => {
      if (cancelled || !r.status) return;
      status = r.status;
      status.addEventListener('change', onChange);
    });
    return () => {
      cancelled = true;
      status?.removeEventListener('change', onChange);
    };
  }, [helpProblem, start]);

  const stop = useCallback(() => recognition.current?.stop(), []);
  const dismissHelp = useCallback(() => setHelp(null), []);

  return { supported, listening, error, help, start: () => void start(), stop, dismissHelp };
}
