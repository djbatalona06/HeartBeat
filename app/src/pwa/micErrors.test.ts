import { describe, expect, it } from 'vitest';
import { TranscribeError, micFailure, transcribeFailure } from './micErrors';

const audio = { mime: 'audio/webm', bytes: 4096 };

describe('micFailure', () => {
  it('tells you where to unblock a denied microphone', () => {
    const f = micFailure(new DOMException('denied', 'NotAllowedError'));
    expect(f.title).toBe('Microphone blocked');
    expect(f.message).toMatch(/site settings/i);
  });

  it('treats SecurityError the same as a denial, because it reads the same', () => {
    expect(micFailure(new DOMException('x', 'SecurityError')).title).toBe('Microphone blocked');
  });

  it('separates no device from a blocked one', () => {
    expect(micFailure(new DOMException('x', 'NotFoundError')).title).toBe('No microphone found');
    expect(micFailure(new DOMException('x', 'OverconstrainedError')).title).toBe(
      'No microphone found',
    );
  });

  it('names the real cause when another app holds the mic', () => {
    const f = micFailure(new DOMException('x', 'NotReadableError'));
    expect(f.title).toBe('Microphone busy');
    expect(f.message).toMatch(/another app/i);
  });

  it('still gives a next action for an unrecognised failure', () => {
    const f = micFailure(new Error('something else entirely'));
    expect(f.title).toBe('Could not start recording');
    expect(f.message).toMatch(/try again/i);
  });

  // Every branch has to lead somewhere. A failure with no next action is the
  // thing this module exists to prevent.
  it('never returns an empty message', () => {
    const cases = [
      new DOMException('x', 'NotAllowedError'),
      new DOMException('x', 'NotFoundError'),
      new DOMException('x', 'NotReadableError'),
      new Error('unknown'),
      undefined,
      null,
    ];
    for (const c of cases) {
      const f = micFailure(c);
      expect(f.title.length).toBeGreaterThan(0);
      expect(f.message.length).toBeGreaterThan(0);
    }
  });
});

describe('transcribeFailure', () => {
  it('points an unpaired device at Settings', () => {
    const f = transcribeFailure(new TranscribeError('nope', 'auth', 401), audio);
    expect(f.title).toBe('This device is not paired');
    expect(f.message).toMatch(/settings/i);
  });

  it('says plainly when the fault is the server’s', () => {
    const f = transcribeFailure(new TranscribeError('502', 'speech-provider', 502), audio);
    expect(f.message).toMatch(/not on you/i);
  });

  it('passes the server’s own wording through for an empty recording', () => {
    const f = transcribeFailure(
      new TranscribeError('The recording was empty. Hold the button while you speak.', 'audio', 400),
      audio,
    );
    expect(f.message).toMatch(/hold the button/i);
  });

  it('carries stage, status and audio detail in the diagnostics', () => {
    const f = transcribeFailure(new TranscribeError('boom', 'speech-provider', 502), audio);
    expect(f.diagnostics).toMatch(/stage: speech-provider/);
    expect(f.diagnostics).toMatch(/status: 502/);
    expect(f.diagnostics).toMatch(/audio: audio\/webm/);
  });

  it('reports offline as offline, whatever the underlying error was', () => {
    const online = Object.getOwnPropertyDescriptor(navigator, 'onLine');
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    try {
      const f = transcribeFailure(new TranscribeError('x', 'speech-provider', 502), audio);
      expect(f.title).toBe('You are offline');
      // The rest of the app is local-first; say so rather than implying it broke.
      expect(f.message).toMatch(/still works offline/i);
    } finally {
      if (online) Object.defineProperty(navigator, 'onLine', online);
    }
  });
});
