import { useState } from 'react';
import type { DayKey } from '../../domain/types';

/**
 * The pet's hello, as a speech bubble under it.
 *
 * Plain text in reading order rather than a live region: it is part of the
 * screen, not news, and announcing it on every visit would be a screen reader
 * interrupting itself to say hi.
 */
export function PetGreeting({ line }: { line: string }) {
  return <p className="home-greeting">{line}</p>;
}

const KEY = 'hb.greeted';

/**
 * True on the first Home visit of `day` on this phone, and then false.
 *
 * `localStorage` rather than `Settings`: this is one device's nicety, and a
 * settings write starts a sync. Read once per mount, so the pose plays for the
 * whole visit rather than being switched off by its own bookkeeping. Storage
 * that throws (a private window, blocked site data) answers false — the line
 * still shows, only the little dance is skipped.
 */
export function usePlayGreetingOnce(day: DayKey): boolean {
  const [first] = useState(() => {
    try {
      if (localStorage.getItem(KEY) === day) return false;
      localStorage.setItem(KEY, day);
      return true;
    } catch {
      return false;
    }
  });
  return first;
}
