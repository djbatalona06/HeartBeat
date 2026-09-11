import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { SOUNDSCAPES, fillNoise, type Soundscape } from '../../domain/selfcare/soundscapes';

/**
 * Soundscapes, synthesised on the phone.
 *
 * Nothing is downloaded and nothing is bundled: each bed is a loop of filtered
 * noise with a slow wobble on the filter. A minute of rain as an audio file is
 * a megabyte or two and five of them would be most of the app — and none of it
 * would work offline, which is the one thing this app is built to do.
 *
 * The graph is built once and retuned when the bed changes, rather than torn
 * down and rebuilt: a fresh `AudioContext` per tap leaks contexts on a phone
 * that only allows a handful. The context is created on the first tap because
 * browsers refuse to start audio without a gesture, and stopping ramps the gain
 * down over 400ms rather than cutting, since an abrupt stop on a noise bed is a
 * click loud enough to make you jump.
 */
export function SoundscapesPage() {
  const [playing, setPlaying] = useState<string | null>(null);
  const [volume, setVolume] = useState(0.5);

  const ctx = useRef<AudioContext | null>(null);
  const source = useRef<AudioBufferSourceNode | null>(null);
  const filter = useRef<BiquadFilterNode | null>(null);
  const gain = useRef<GainNode | null>(null);
  const lfo = useRef<OscillatorNode | null>(null);
  const lfoGain = useRef<GainNode | null>(null);

  // Everything is torn down when the screen goes away. Without this the bed
  // keeps playing over whatever you navigate to next.
  useEffect(() => () => { void stopAll(); }, []);

  async function stopAll() {
    const g = gain.current;
    const context = ctx.current;
    if (g && context) {
      g.gain.cancelScheduledValues(context.currentTime);
      g.gain.setValueAtTime(g.gain.value, context.currentTime);
      g.gain.linearRampToValueAtTime(0.0001, context.currentTime + 0.4);
    }
    const src = source.current;
    const osc = lfo.current;
    window.setTimeout(() => {
      try { src?.stop(); } catch { /* already stopped */ }
      try { osc?.stop(); } catch { /* already stopped */ }
    }, 450);
    source.current = null;
    lfo.current = null;
  }

  async function play(bed: Soundscape) {
    if (playing === bed.id) {
      await stopAll();
      setPlaying(null);
      return;
    }
    await stopAll();

    // Created on a tap, because browsers will not start audio without one.
    ctx.current ??= new AudioContext();
    const context = ctx.current;
    if (context.state === 'suspended') await context.resume();

    // Four seconds is long enough that the loop point is not audible as a
    // rhythm, and short enough to generate without a stutter.
    const frames = context.sampleRate * 4;
    const buffer = context.createBuffer(1, frames, context.sampleRate);
    fillNoise(buffer.getChannelData(0), bed.noise, Math.random);

    const src = context.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const biquad = context.createBiquadFilter();
    biquad.type = 'lowpass';
    biquad.frequency.value = bed.cutoff;
    biquad.Q.value = bed.q;

    const out = context.createGain();
    out.gain.value = 0.0001;

    // The wobble: a very slow oscillator pushing the filter cutoff around, which
    // is what stops a static hiss sounding like a static hiss.
    const osc = context.createOscillator();
    osc.frequency.value = bed.sway;
    const depth = context.createGain();
    depth.gain.value = bed.cutoff * bed.depth;
    osc.connect(depth).connect(biquad.frequency);

    src.connect(biquad).connect(out).connect(context.destination);
    src.start();
    osc.start();
    out.gain.linearRampToValueAtTime(volume, context.currentTime + 0.6);

    source.current = src;
    filter.current = biquad;
    gain.current = out;
    lfo.current = osc;
    lfoGain.current = depth;
    setPlaying(bed.id);
  }

  function onVolume(next: number) {
    setVolume(next);
    const g = gain.current;
    const context = ctx.current;
    if (g && context) g.gain.linearRampToValueAtTime(next, context.currentTime + 0.1);
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">Soundscapes</h1>
        <p className="page-sub">Made on the phone, so they work with no signal.</p>
      </header>

      <Link className="goal-link" to="/activities">← Activities</Link>

      <section className="panel">
        <ul className="bed-list">
          {SOUNDSCAPES.map((bed) => (
            <li className="bed" key={bed.id}>
              <button
                type="button"
                className="bed-button"
                data-playing={playing === bed.id ? 'true' : 'false'}
                onClick={() => void play(bed)}
                aria-pressed={playing === bed.id}
              >
                <span className="bed-name">{bed.name}</span>
                <span className="bed-blurb">{bed.blurb}</span>
                <span className="bed-state">{playing === bed.id ? 'Playing' : 'Play'}</span>
              </button>
            </li>
          ))}
        </ul>

        <label className="bed-volume">
          <span className="section-sub">Volume</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => onVolume(Number(e.target.value))}
            aria-label="Volume"
          />
        </label>
      </section>
    </div>
  );
}
