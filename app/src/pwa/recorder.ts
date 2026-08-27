// Microphone capture: getUserMedia + MediaRecorder for the audio blob, plus a
// Web Audio AnalyserNode that emits 0..1 bar heights for the live waveform.
//
// Ported from WhimprFlow's recorder, which is already proven on iOS. The one
// change is resuming the AudioContext: Safari hands back a suspended context
// when the page has not had a user gesture recently, and a suspended analyser
// reports silence forever — the recording still works, but the waveform sits
// flat and the whole thing looks broken.

export interface Recorder {
  stop(): Promise<Blob>;
  cancel(): void;
  mimeType: string;
}

function pickMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/mpeg'];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(c)) return c;
  }
  return '';
}

/**
 * Start recording. `onBars` is called each frame with normalised bar heights
 * (0..1) for the waveform. Resolves once the microphone is live; rejects with
 * the DOMException getUserMedia threw, which `micErrors.ts` turns into
 * something a person can act on.
 */
export async function startRecording(
  onBars: (bars: number[]) => void,
  barCount = 13,
): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = pickMimeType();
  const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  rec.start(100);

  const AudioCtx: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioCtx();
  // Fire and forget: if this rejects the recording is still sound, only the
  // meter is dead, and failing the whole take over a cosmetic layer is worse.
  if (audioCtx.state === 'suspended') void audioCtx.resume().catch(() => {});
  const source = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);
  const buf = new Uint8Array(analyser.frequencyBinCount);

  let raf = 0;
  const tick = () => {
    analyser.getByteFrequencyData(buf);
    const step = Math.floor(buf.length / barCount) || 1;
    const bars: number[] = [];
    for (let b = 0; b < barCount; b += 1) {
      let sum = 0;
      for (let k = 0; k < step; k += 1) sum += buf[b * step + k] ?? 0;
      bars.push(Math.min(1, sum / step / 200));
    }
    onBars(bars);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  const teardown = () => {
    cancelAnimationFrame(raf);
    stream.getTracks().forEach((t) => t.stop());
    audioCtx.close().catch(() => {});
  };

  return {
    mimeType: rec.mimeType || mimeType || 'audio/webm',

    stop(): Promise<Blob> {
      return new Promise((resolve) => {
        rec.onstop = () => {
          teardown();
          resolve(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
        };
        rec.stop();
      });
    },

    /** Drop the take. onstop is cleared first so the stop promise never settles. */
    cancel(): void {
      try {
        rec.onstop = null;
        if (rec.state !== 'inactive') rec.stop();
      } catch {
        /* the recorder was already torn down */
      }
      teardown();
    },
  };
}
