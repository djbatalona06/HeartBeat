import { useEffect, useRef, useState, type RefObject } from 'react';
import { isBigLevelUp, levelUpSince } from '../../domain/pet/levelUp';
import { play } from '../../pwa/sound';
import { LevelUpAnimator, levelUpPlan } from './levelUpAnimator';

const KEY = 'hb.petLevelSeen';

/** `localStorage` rather than `Settings`, like `hb.greeted`: one phone's
 *  nicety, and a settings write starts a sync. Storage that throws reads as
 *  "never seen", which plays nothing. */
function readSeen(): number | null {
  try {
    const raw = localStorage.getItem(KEY);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeSeen(level: number): void {
  try {
    localStorage.setItem(KEY, String(level));
  } catch {
    // Nothing to do. The worst outcome is a level-up nobody celebrates.
  }
}

interface Options {
  /** False until the pet row (or its absence) is known. */
  ready: boolean;
  /** The pet's derived level, or `null` when there is no pet yet. */
  level: number | null;
  calm: boolean;
  /** `Settings.sound`, straight off the row. */
  sound: boolean;
  mascot: RefObject<Element | null>;
  fill: RefObject<Element | null>;
}

/**
 * Plays the level-up on Home when the pet's level is above the last one this
 * phone showed, and says whether the greeting pose should wait.
 *
 * The baseline lives in a ref and only moves forward once an animation has
 * finished (or there was nothing to play), so StrictMode's double effect in
 * development replays the moment rather than eating it.
 *
 * Returns `true` while the greeting pose should be held back: until the level
 * is known, and while the level-up is running. Both animate the mascot's
 * `transform`, and the level-up goes first.
 */
export function useLevelUpMoment({ ready, level, calm, sound, mascot, fill }: Options): boolean {
  const baseline = useRef<number | null | undefined>(undefined);
  const firstLevel = useRef<number | null | undefined>(undefined);
  const [checked, setChecked] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!ready) return undefined;
    if (level === null) { setChecked(true); return undefined; }

    if (baseline.current === undefined) baseline.current = readSeen();
    if (firstLevel.current === undefined) firstLevel.current = level;
    writeSeen(level);

    const seen = baseline.current;
    const hit = levelUpSince(seen, level);
    setChecked(true);
    if (hit === null || seen === null) {
      baseline.current = level;
      return undefined;
    }

    const animator = new LevelUpAnimator(
      { mascot: mascot.current, fill: fill.current },
      levelUpPlan({ calm, big: isBigLevelUp(seen, hit) }),
    );
    // Only for a level that moved while Home was open. The catch-up on mount
    // has no tap behind it, and the browser would drop the sound anyway.
    if (level !== firstLevel.current) play('levelUp', { calm, enabled: sound });

    let alive = true;
    setRunning(true);
    void animator.run().then(() => {
      if (!alive) return;
      baseline.current = level;
      setRunning(false);
    });
    return () => {
      alive = false;
      animator.cancel();
      setRunning(false);
    };
  }, [ready, level, calm, sound, mascot, fill]);

  return !checked || running;
}
