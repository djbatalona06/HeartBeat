import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_MOOD, HAPPY_AT, moodFor, moodWords, normalizeMood, type PetMood,
} from './mood';
import { NIGHT_FROM, NIGHT_UNTIL } from '../notify/schedule';
import { phaseAt } from '../scene/schedule';

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const GLOWS = [0, 0.1, 0.25, 0.5, 0.65, 0.66, 0.9, 1];

describe('moodFor', () => {
  it('is sleepy at night whatever the glow', () => {
    for (const glow of GLOWS) {
      expect(moodFor({ hour: 2, glow }), `glow ${glow}`).toBe('sleepy');
      expect(moodFor({ hour: 23, glow }), `glow ${glow}`).toBe('sleepy');
    }
  });

  it('is happy in the day when the glow is high', () => {
    expect(moodFor({ hour: 14, glow: 1 })).toBe('happy');
    expect(moodFor({ hour: 14, glow: HAPPY_AT })).toBe('happy');
  });

  it('is content in the day when the glow is low', () => {
    expect(moodFor({ hour: 14, glow: 0 })).toBe('content');
    expect(moodFor({ hour: 14, glow: HAPPY_AT - 0.01 })).toBe('content');
  });

  /**
   * The whole design, as an assertion.
   *
   * A quiet fortnight takes the pet from happy to content and stops there. If
   * anything ever takes it lower, opening the app after a hard week becomes
   * being told off — which is the first of the three traps this overhaul is
   * gated on, and the reason `'sulking'` no longer exists to fall to.
   */
  it('never goes below content, however long the couple has been away', () => {
    for (const hour of HOURS) {
      for (const glow of GLOWS) {
        const mood = moodFor({ hour, glow });
        expect(['happy', 'content', 'sleepy'], `${hour}h glow ${glow}`).toContain(mood);
      }
    }
    // The worst possible reading is still not a bad mood.
    expect(moodFor({ hour: 12, glow: 0 })).toBe(DEFAULT_MOOD);
  });

  it('clamps a glow outside 0..1 rather than throwing', () => {
    expect(moodFor({ hour: 12, glow: 1.4 })).toBe('happy');
    expect(moodFor({ hour: 12, glow: -3 })).toBe('content');
  });

  /**
   * Three modules in this app now have an opinion about night, and two of them
   * are not this one.
   *
   * The pet follows the **garden** — `phaseAt`, which is the sun, at
   * `SUNRISE = 6` and `SUNSET = 19`. That is the right source because the pet
   * is drawn *on top of* the garden on the home screen: a bouncing mascot over
   * a starfield is a disagreement you can see in one glance.
   *
   * It deliberately does **not** follow `NIGHT_FROM`/`NIGHT_UNTIL` (22:00-08:00),
   * which is the notification window. That one is about when a phone should
   * stay silent, and it is wider on purpose — at six in the morning the sun is
   * up but you may well still be asleep, and at eight in the evening it is dark
   * and you are plainly awake.
   *
   * This test asserted they agreed and failed at 06:00, which is exactly where
   * the two definitions part company. The assertion was wrong, not the code —
   * so it now pins the real relationship instead: the pet tracks the sun, and
   * the two windows are known to differ at the edges.
   */
  it('dozes with the garden rather than with the notification window', () => {
    for (const hour of HOURS) {
      const asleep = moodFor({ hour, glow: 1 }) === 'sleepy';
      expect(asleep, `hour ${hour}`).toBe(phaseAt(hour) === 'night');
    }
  });

  it('knows the two windows are not the same window', () => {
    // If these ever coincide, one of the two has been quietly redefined and
    // somebody should look at why rather than discovering it on a phone.
    const sunDown = HOURS.filter((h) => phaseAt(h) === 'night');
    const silent = HOURS.filter((h) => h >= NIGHT_FROM || h < NIGHT_UNTIL);
    expect(sunDown).not.toEqual(silent);
    // The quiet window is the wider of the two at the morning end: the sun is
    // up from 06:00 but the phone stays silent until 08:00.
    expect(silent).toContain(6);
    expect(sunDown).not.toContain(6);
  });
});

describe('normalizeMood', () => {
  it('keeps the two it can draw', () => {
    expect(normalizeMood('happy')).toBe('happy');
    expect(normalizeMood('sleepy')).toBe('sleepy');
  });

  it('resolves anything else to the floor', () => {
    for (const value of ['content', 'sulking', 'furious', '', null, undefined, 7, {}]) {
      expect(normalizeMood(value), String(value)).toBe(DEFAULT_MOOD);
    }
  });

  /**
   * The row from somewhere this version cannot see — a partner on an older
   * build, a restored backup. It must land on a face that exists, and the only
   * faces left are kind ones.
   */
  it('turns a stored sulk into the floor rather than a frown', () => {
    expect(normalizeMood('sulking')).toBe('content');
  });
});

describe('moodWords', () => {
  const ALL: PetMood[] = ['happy', 'content', 'sleepy'];

  it('says something for every mood', () => {
    for (const mood of ALL) expect(moodWords(mood).length).toBeGreaterThan(0);
  });

  it('describes the animal, never the person reading it', () => {
    // These are spoken by a screen reader on the home screen and are the only
    // place the mood is language at all. A verdict on the couple has no
    // business in a description of a drawing.
    const VERDICT = /you|your|missed|behind|neglect|lonely|sad|sulk|disappoint|ignored/i;
    for (const mood of ALL) {
      expect(moodWords(mood), mood).not.toMatch(VERDICT);
    }
  });
});

describe('the sulk is gone, not hidden', () => {
  /**
   * A comment saying the pet never frowns is a comment. This walks the source.
   *
   * If `'sulking'` comes back anywhere — a type member, a branch in the face,
   * a stored value — this fails, and whoever added it has to come and argue
   * with the header of `mood.ts` rather than shipping it quietly.
   */
  it('appears nowhere in the app but the note explaining its removal', () => {
    const SRC = fileURLToPath(new URL('../..', import.meta.url));
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!/\.tsx?$/.test(entry.name)) continue;
        if (full.includes(join('domain', 'pet'))) continue;
        if (/\bsulk/i.test(readFileSync(full, 'utf8'))) offenders.push(relative(SRC, full));
      }
    };
    walk(SRC);

    expect(offenders, 'the pet has no face for disappointment — see domain/pet/mood.ts')
      .toEqual([]);
  });
});
