'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

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

const ERRORS: Record<string, string> = {
  'not-allowed': 'Microphone access was blocked. Allow it in your browser settings to dictate.',
  'service-not-allowed': 'Microphone access was blocked. Allow it in your browser settings to dictate.',
  'no-speech': "Didn't catch anything. Try again.",
  'audio-capture': 'No microphone was found.',
  network: 'Dictation needs a network connection.',
};

/**
 * Browser speech-to-text for the composer. Chrome and Safari stream the audio to
 * their own speech service, so the UI labels it; nothing is sent to MarketMitra.
 * `supported` is false on the server and in browsers without the API (e.g. Firefox).
 */
export function useDictation(onFinalText: (text: string) => void) {
  const supported = useSyncExternalStore(noopSubscribe, () => getCtor() !== null, () => false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognition = useRef<RecognitionLike | null>(null);
  const callback = useRef(onFinalText);
  useEffect(() => {
    callback.current = onFinalText;
  });
  useEffect(() => () => recognition.current?.stop(), []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) return;
    setError(null);
    const rec = new Ctor();
    rec.lang = navigator.language || 'en-IN';
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) callback.current(e.results[i][0].transcript.trim());
      }
    };
    rec.onerror = (e) => setError(ERRORS[e.error] ?? 'Dictation stopped unexpectedly.');
    rec.onend = () => setListening(false);
    recognition.current = rec;
    rec.start();
    setListening(true);
  }, []);

  const stop = useCallback(() => recognition.current?.stop(), []);

  return { supported, listening, error, start, stop };
}
