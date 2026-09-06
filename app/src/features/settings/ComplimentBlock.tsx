import { useEffect, useState } from 'react';
import { loadSettings, saveSettings } from '../../db/database';
import { MAX_PET_NAME, TONES, type Tone } from '../../domain/compliment/tone';

/**
 * How the sweet things should sound, and what they must never say.
 *
 * The sender's settings, not the couple's: two people in one relationship do
 * not talk the same way, and a shared tone would make one of them sound like
 * the other.
 *
 * The blocklist is the part worth having. Every couple has words that land
 * wrong — a body word, an old joke that stopped being funny — and a suggestion
 * carrying one is dropped before it is ever drawn, because seeing it is the
 * harm and hiding it afterwards is too late.
 */

const TONE_LABEL: Record<Tone, string> = {
  tender: 'Tender',
  playful: 'Playful',
  funny: 'Funny',
  proud: 'Proud',
};

export function ComplimentBlock() {
  const [tone, setTone] = useState<Tone>('tender');
  const [petName, setPetName] = useState('');
  const [blocked, setBlocked] = useState('');

  useEffect(() => {
    let live = true;
    loadSettings().then((s) => {
      if (!live) return;
      setTone(s.complimentTone ?? 'tender');
      setPetName(s.complimentPetName ?? '');
      setBlocked((s.complimentBlocked ?? []).join(', '));
    });
    return () => { live = false; };
  }, []);

  function persist(patch: Parameters<typeof saveSettings>[0]) {
    void saveSettings(patch);
  }

  return (
    <section className="study">
      <h2 className="study-title">Sweet things</h2>
      <p className="study-note">
        How the suggestions on the Mood page should sound. Nothing is ever sent
        without you picking it first.
      </p>

      <div className="study-actions" role="radiogroup" aria-label="Tone">
        {TONES.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={tone === option}
            className={
              tone === option ? 'study-button' : 'study-button study-button-quiet'
            }
            onClick={() => {
              setTone(option);
              persist({ complimentTone: option });
            }}
          >
            {TONE_LABEL[option]}
          </button>
        ))}
      </div>

      <label className="study-field">
        <span className="study-note">What you call them</span>
        <input
          className="study-input"
          value={petName}
          maxLength={MAX_PET_NAME}
          placeholder="Leave blank for no name"
          onChange={(e) => setPetName(e.target.value)}
          onBlur={() => persist({ complimentPetName: petName.trim() })}
        />
      </label>

      <label className="study-field">
        <span className="study-note">Words to never use, separated by commas</span>
        <input
          className="study-input"
          value={blocked}
          placeholder="e.g. skinny, diet"
          onChange={(e) => setBlocked(e.target.value)}
          onBlur={() =>
            persist({
              complimentBlocked: blocked
                .split(',')
                .map((w) => w.trim())
                .filter(Boolean),
            })
          }
        />
      </label>
    </section>
  );
}
