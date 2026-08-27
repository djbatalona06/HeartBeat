import { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { loadSettings } from '../db/database';
import { startRecording, type Recorder } from '../pwa/recorder';
import { transcribe } from '../pwa/api';
import { micFailure, transcribeFailure, type Failure } from '../pwa/micErrors';

/**
 * One microphone button, used by tasks, the calendar and the chat composer.
 *
 * The phases are the same four everywhere — idle, recording, transcribing,
 * error — so they live here rather than three times over. What differs between
 * callers is only what they do with the words, which is `onTranscript`.
 *
 * Errors render inline rather than as a toast: a failure you have to catch
 * before it fades is a failure you cannot act on.
 */

type Phase = 'idle' | 'recording' | 'transcribing' | 'error';

interface Props {
  onTranscript: (text: string) => void;
  /** Shown under the button while idle. */
  hint?: string;
  label?: string;
}

const BAR_COUNT = 13;

export function VoiceInput({ onTranscript, hint, label = 'Speak' }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [failure, setFailure] = useState<Failure | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [copied, setCopied] = useState(false);

  const recorder = useRef<Recorder | null>(null);
  const bars = useRef<number[]>(new Array(BAR_COUNT).fill(0));
  const canvas = useRef<HTMLCanvasElement>(null);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const settings = useLiveQuery(() => loadSettings(), []);
  const token = settings?.workerSecret;

  const clearTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  // A recorder left running when the screen unmounts holds the microphone
  // open, and iOS shows the recording indicator until the tab is closed.
  useEffect(() => {
    return () => {
      recorder.current?.cancel();
      recorder.current = null;
      clearTimer();
    };
  }, []);

  const paint = useCallback(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (el.width !== w * dpr || el.height !== h * dpr) {
      el.width = w * dpr;
      el.height = h * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const css = getComputedStyle(document.documentElement);
    ctx.fillStyle = css.getPropertyValue('--color-accent').trim() || '#ff8fb0';

    const gap = 3;
    const barWidth = (w - gap * (BAR_COUNT - 1)) / BAR_COUNT;
    for (let i = 0; i < BAR_COUNT; i += 1) {
      // A sine envelope so the middle stands tallest — a flat block of bars
      // reads as a loading bar rather than as a voice.
      const envelope = Math.sin((i / (BAR_COUNT - 1)) * Math.PI) * 0.6 + 0.4;
      const level = (bars.current[i] ?? 0) * envelope;
      const barHeight = Math.max(2, level * h);
      const x = i * (barWidth + gap);
      const y = (h - barHeight) / 2;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, barWidth / 2);
      ctx.fill();
    }
  }, []);

  useEffect(() => {
    if (phase !== 'recording') return;
    let raf = 0;
    const tick = () => {
      paint();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, paint]);

  const begin = async () => {
    setFailure(null);
    setCopied(false);
    try {
      recorder.current = await startRecording((next) => {
        bars.current = next;
      }, BAR_COUNT);
      startedAt.current = Date.now();
      setElapsed(0);
      clearTimer();
      timer.current = setInterval(() => setElapsed(Date.now() - startedAt.current), 250);
      setPhase('recording');
    } catch (e) {
      setFailure(micFailure(e));
      setPhase('error');
    }
  };

  const finish = async () => {
    const rec = recorder.current;
    if (!rec) return;
    recorder.current = null;
    clearTimer();
    setPhase('transcribing');

    let blob: Blob | null = null;
    try {
      blob = await rec.stop();
      if (!token) {
        // Reuse the transcribe error path so the wording stays in one place.
        const { TranscribeError } = await import('../pwa/micErrors');
        throw new TranscribeError('not paired', 'auth', 401);
      }
      const text = await transcribe(blob, token);
      onTranscript(text);
      setPhase('idle');
    } catch (e) {
      setFailure(
        transcribeFailure(e, { mime: blob?.type ?? '', bytes: blob?.size ?? 0 }),
      );
      setPhase('error');
    }
  };

  const cancel = () => {
    recorder.current?.cancel();
    recorder.current = null;
    clearTimer();
    setPhase('idle');
  };

  if (phase === 'recording') {
    const seconds = Math.floor(elapsed / 1000);
    const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    return (
      <div className="voice voice-live">
        <span className="voice-dot" aria-hidden="true" />
        <canvas ref={canvas} className="voice-wave" aria-hidden="true" />
        <span className="voice-clock">{clock}</span>
        <button type="button" className="voice-stop" onClick={finish}>
          Done
        </button>
        <button type="button" className="voice-cancel" onClick={cancel} aria-label="Discard">
          ✕
        </button>
      </div>
    );
  }

  if (phase === 'transcribing') {
    return (
      <div className="voice">
        <span className="voice-working" role="status">
          Turning that into words…
        </span>
      </div>
    );
  }

  if (phase === 'error' && failure) {
    return (
      <div className="voice voice-failed" role="alert">
        <strong className="voice-failed-title">{failure.title}</strong>
        <p className="voice-failed-body">{failure.message}</p>
        <div className="row">
          <button type="button" className="quiet" onClick={() => setPhase('idle')}>
            Dismiss
          </button>
          <button type="button" className="quiet" onClick={begin}>
            Try again
          </button>
        </div>
        {failure.diagnostics ? (
          <button
            type="button"
            className="voice-diag"
            onClick={() => {
              navigator.clipboard?.writeText(failure.diagnostics ?? '').then(
                () => setCopied(true),
                () => setCopied(false),
              );
            }}
          >
            {copied ? 'Copied' : 'Copy the technical detail'}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="voice">
      <button type="button" className="voice-mic" onClick={begin} aria-label={label}>
        <MicGlyph />
        <span>{label}</span>
      </button>
      {hint ? <span className="voice-hint">{hint}</span> : null}
    </div>
  );
}

/** Drawn rather than imported: no third-party artwork anywhere, see NOTICE.md. */
function MicGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="none">
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
      <path
        d="M6 11a6 6 0 0 0 12 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path d="M12 17v3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
