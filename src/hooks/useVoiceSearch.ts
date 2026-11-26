import { useCallback, useEffect, useRef, useState } from 'react';

interface SpeechResultEvent {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

const getCtor = (): RecognitionCtor | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

const ERRORS: Record<string, string> = {
  'not-allowed': 'Microphone access is blocked. Allow it in your browser settings to search by voice.',
  'service-not-allowed': 'Voice search is not allowed on this device.',
  'no-speech': 'We did not catch that. Tap the microphone and try again.',
  'audio-capture': 'No microphone was found.',
  network: 'Voice search needs a connection.',
};

/** Voice input through the Web Speech API where the browser has it; `supported` is false elsewhere. */
export function useVoiceSearch(onFinal: (text: string) => void) {
  const supported = Boolean(getCtor());
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<Recognition | null>(null);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  const stop = useCallback(() => {
    ref.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) return;
    ref.current?.abort();
    const rec = new Ctor();
    rec.lang = navigator.language || 'en-IN';
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.continuous = false;
    rec.onresult = (e) => {
      let finalText = '';
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]!;
        if (r.isFinal) finalText += r[0]!.transcript;
        else live += r[0]!.transcript;
      }
      setInterim(live);
      if (finalText.trim()) onFinalRef.current(finalText.trim().replace(/[.?!]$/, ''));
    };
    rec.onerror = (e) => {
      if (e.error !== 'aborted') setError(ERRORS[e.error] ?? 'Voice search stopped unexpectedly.');
      setListening(false);
    };
    rec.onend = () => {
      setListening(false);
      setInterim('');
    };
    ref.current = rec;
    setError(null);
    setInterim('');
    try {
      rec.start();
      setListening(true);
    } catch {
      setError('Voice search could not start.');
    }
  }, []);

  useEffect(() => () => ref.current?.abort(), []);

  return { supported, listening, interim, error, start, stop, clearError: () => setError(null) };
}
