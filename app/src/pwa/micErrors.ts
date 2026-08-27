/**
 * Turning microphone and transcription failures into something a person can do
 * something about.
 *
 * A raw DOMException name is not an error message. "NotAllowedError" tells you
 * nothing; "open the lock icon in the address bar and allow the microphone"
 * tells you where to go. Every branch here names a next action, because the
 * person hitting these is testing the app alone with nobody to ask.
 *
 * Pure and DOM-free on purpose, so vitest can reach it — see vitest.config.ts,
 * which only collects .ts.
 */

export interface Failure {
  title: string;
  message: string;
  /** Technical detail, shown behind a copy button rather than in the message. */
  diagnostics?: string;
}

/** Thrown by the transcribe client; `stage` says which part gave way. */
export class TranscribeError extends Error {
  readonly stage: string;
  readonly status: number;

  constructor(message: string, stage: string, status: number) {
    super(message);
    this.name = 'TranscribeError';
    this.stage = stage;
    this.status = status;
  }
}

/** What getUserMedia rejected with, in the four ways it actually happens. */
export function micFailure(e: unknown): Failure {
  const name = e instanceof DOMException ? e.name : '';

  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return {
      title: 'Microphone blocked',
      message:
        'Your browser is holding the microphone back. Open the site settings — the lock or ⓘ icon next to the address — allow the microphone, then try again.',
    };
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return {
      title: 'No microphone found',
      message:
        'This device did not offer a microphone. Check that one is connected and not switched off.',
    };
  }
  if (name === 'NotReadableError') {
    return {
      title: 'Microphone busy',
      message: 'Another app is holding the microphone. Close it and try again.',
    };
  }
  return {
    title: 'Could not start recording',
    message:
      'The microphone did not start. Try again, or reload the app if it keeps happening.',
  };
}

/** What the transcribe round-trip failed at, branching on the server's stage. */
export function transcribeFailure(e: unknown, audio: { mime: string; bytes: number }): Failure {
  const base: Failure = {
    title: 'Could not turn that into words',
    message: 'The recording did not come back as text. Try saying it again.',
  };

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      title: 'You are offline',
      message:
        'Speech needs a connection, because the transcription runs on the server. Everything else in the app still works offline.',
    };
  }

  if (e instanceof TranscribeError) {
    if (e.stage === 'auth') {
      base.title = 'This device is not paired';
      base.message =
        'Speech runs on the server, so it needs a paired device. Open Settings and pair, then try again.';
    } else if (e.stage === 'audio') {
      base.title = 'Nothing was recorded';
      base.message = e.message;
    } else if (e.stage === 'transcribe') {
      base.title = 'Nothing was heard';
      base.message = e.message;
    } else if (e.stage === 'speech-provider') {
      base.title = 'The speech service is down';
      base.message =
        'This is on the server, not on you. Type it for now and try the microphone again later.';
    }
  }

  const meta = [
    `when: ${new Date().toISOString()}`,
    `audio: ${audio.mime || 'unknown'} · ${(audio.bytes / 1024).toFixed(0)} KB`,
  ];
  if (e instanceof TranscribeError) {
    meta.unshift(`stage: ${e.stage}`, `status: ${e.status}`, `detail: ${e.message}`);
  } else if (e instanceof Error) {
    meta.unshift(`detail: ${e.message}`);
  }
  base.diagnostics = meta.join('\n');

  return base;
}
