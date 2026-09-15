import { MAX_LEVEL } from '../xp';
import type { RaidStatKey } from './raidStats';

/**
 * What a level is actually worth.
 *
 * ## Why this exists at all
 *
 * `xp.ts` grew a fifty-level curve, and a fifty-level curve with nothing at the
 * top of it is worse than a ten-level one — it is thirty extra levels of a
 * number going up. A curve is a promise; this is the thing being promised.
 *
 * ## The shape of the ladder
 *
 * It follows the bands in `xp.ts`, because the bands are already a statement
 * about how long each stretch takes and the rewards should say the same thing:
 *
 * - **2–10, days.** Things that change the screen. A new plot to grow
 *   something in, the companion's support skill, the first tether. The early
 *   game has to keep handing you something, because that is the fortnight in
 *   which somebody decides whether this app is a thing they do.
 * - **11–20, weeks.** More plots and the first real stat gains — the garden
 *   filling out at the same rate the two of you are.
 * - **21–30, months.** Stat gains, and the last of the plots. By here the
 *   garden is a place rather than a lawn.
 * - **31–50, a long time.** Prestige tethers and small stat gains. Deliberately
 *   the thinnest band: a reward every level for two years would be a treadmill,
 *   and the point of the top of a curve is that reaching it meant something,
 *   not that it kept paying.
 *
 * ## What a milestone is allowed to be
 *
 * Every entry either **opens something** or **adds a number**, and nothing here
 * is a message. A level-up that says "well done" and grants nothing is a
 * notification, and this app already has enough of those.
 *
 * Stat grants are deliberately small — 34 points across the whole climb, where
 * a single mythic item is up to 50 — because levelling is the one thing both
 * partners contribute to and a curve that out-scaled gear would make the
 * wardrobe pointless. It is a floor under a couple who own nothing, not a
 * replacement for owning things.
 */

export type MilestoneKind = 'plot' | 'skill' | 'tether' | 'stat' | 'prestige';

export const MILESTONE_KIND_NAMES: Record<MilestoneKind, string> = {
  plot: 'A place to grow something',
  skill: 'Your companion learns something',
  tether: 'The tether',
  stat: 'The two of you',
  prestige: 'Something to have reached',
};

export interface Milestone {
  level: number;
  kind: MilestoneKind;
  name: string;
  blurb: string;
  /** For `plot`: the id in `plots.ts` this opens. */
  plot?: string;
  /** For `stat`: which raid stat, and how much of it. */
  stat?: { key: RaidStatKey; points: number };
  /** For `tether` and `prestige`: the look this unlocks. */
  tether?: string;
  /** For `skill`: which half of the companion's kit this opens. */
  skill?: 'support' | 'passive';
}

/**
 * Ordered by level, and `milestones.test.ts` fails if it is not — every lookup
 * below walks it in order and a single entry out of place would silently make
 * the wrong thing unlock first.
 */
export const MILESTONES: readonly Milestone[] = [
  // -- days ------------------------------------------------------------------
  {
    level: 2, kind: 'plot', plot: 'plot-doorstep',
    name: 'The doorstep',
    blurb: 'A patch by the door. Small, and the first thing either of you sees.',
  },
  {
    level: 3, kind: 'skill', skill: 'passive',
    name: 'Your companion settles in',
    blurb: 'Its passive starts counting. It was always there; now it does something.',
  },
  {
    level: 4, kind: 'plot', plot: 'plot-pondside',
    name: 'Pondside',
    blurb: 'The soft ground by the water, which will grow almost anything.',
  },
  {
    level: 5, kind: 'tether', tether: 'tether-plain',
    name: 'A thread you can see',
    blurb: 'The tether stops being a rumour and starts being a line on the ground.',
  },
  {
    level: 6, kind: 'skill', skill: 'support',
    name: 'Your companion learns its second move',
    blurb: 'The support skill opens. Every companion has one, and none of them share it.',
  },
  {
    level: 8, kind: 'plot', plot: 'plot-the-verge',
    name: 'The verge',
    blurb: 'Along the path in. Nothing important grows here, which is the charm of it.',
  },
  {
    level: 10, kind: 'stat', stat: { key: 'resilience', points: 3 },
    name: 'Ten',
    blurb: 'The two of you can take a little more than you could a fortnight ago.',
  },

  // -- weeks -----------------------------------------------------------------
  {
    level: 12, kind: 'plot', plot: 'plot-under-the-trees',
    name: 'Under the trees',
    blurb: 'Shade most of the day. Fussy, and worth the fuss.',
  },
  {
    level: 14, kind: 'tether', tether: 'tether-braided',
    name: 'Braided',
    blurb: 'Two threads wound together, which is a better description than one was.',
  },
  {
    level: 15, kind: 'stat', stat: { key: 'resonance', points: 3 },
    name: 'Fifteen',
    blurb: 'The tether charges faster. You have got better at noticing each other.',
  },
  {
    level: 18, kind: 'plot', plot: 'plot-the-far-corner',
    name: 'The far corner',
    blurb: 'Out of sight of the gate. Something ought to be down there.',
  },
  {
    level: 20, kind: 'stat', stat: { key: 'recovery', points: 4 },
    name: 'Twenty',
    blurb: 'Rest is worth more. You have both finally worked out how to take it.',
  },

  // -- months ----------------------------------------------------------------
  {
    level: 23, kind: 'plot', plot: 'plot-the-old-bed',
    name: 'The old bed',
    blurb: 'Somebody planted here once. Whatever it was, it is long gone.',
  },
  {
    level: 25, kind: 'stat', stat: { key: 'fortify', points: 4 },
    name: 'Twenty-five',
    blurb: 'A shielded turn holds more. Half a year of practice at holding.',
  },
  {
    level: 27, kind: 'tether', tether: 'tether-woven',
    name: 'Woven',
    blurb: 'No longer two threads. You would have to cut it to find the join.',
  },
  {
    level: 28, kind: 'plot', plot: 'plot-the-long-border',
    name: 'The long border',
    blurb: 'The whole south edge. The last of the ground, and the best of it.',
  },
  {
    level: 30, kind: 'stat', stat: { key: 'burden', points: 5 },
    name: 'Thirty',
    blurb: 'What you carry lands harder on the things that put it there.',
  },

  // -- a long time -----------------------------------------------------------
  {
    level: 35, kind: 'stat', stat: { key: 'energy', points: 4 },
    name: 'Thirty-five',
    blurb: 'More turns in a day than the day strictly gave you.',
  },
  {
    level: 40, kind: 'prestige', tether: 'tether-gold',
    name: 'Forty',
    blurb: 'The tether goes gold. Nothing about it works differently.',
  },
  {
    level: 45, kind: 'stat', stat: { key: 'reveal', points: 5 },
    name: 'Forty-five',
    blurb: 'Very little about a bad week surprises either of you now.',
  },
  {
    level: MAX_LEVEL, kind: 'prestige', tether: 'tether-daylight',
    name: 'Fifty',
    blurb: 'The tether stops glowing and simply lights the garden. You got here.',
  },
];

/* -- reading the ladder ------------------------------------------------------ */

/** Everything earned at or below `level`, in the order it was earned. */
export function milestonesUpTo(level: number): Milestone[] {
  return MILESTONES.filter((entry) => entry.level <= level);
}

/** Everything a single level hands over. Usually one thing; never assume it. */
export function milestonesAt(level: number): Milestone[] {
  return MILESTONES.filter((entry) => entry.level === level);
}

/** The next thing to come, or null at the top of the ladder. */
export function nextMilestone(level: number): Milestone | null {
  return MILESTONES.find((entry) => entry.level > level) ?? null;
}

/** Plot ids open at this level. `plots.ts` turns them into ground. */
export function unlockedPlots(level: number): string[] {
  return milestonesUpTo(level)
    .filter((entry) => entry.kind === 'plot' && entry.plot)
    .map((entry) => entry.plot as string);
}

/** Tether looks earned so far, oldest first. The last one is the one worn. */
export function unlockedTethers(level: number): string[] {
  return milestonesUpTo(level)
    .filter((entry) => entry.tether)
    .map((entry) => entry.tether as string);
}

/** The look the tether wears now: the most recent one earned, or the bare
 *  thread nobody has to earn. */
export const BARE_TETHER = 'tether-bare';

export function tetherFor(level: number): string {
  const earned = unlockedTethers(level);
  return earned[earned.length - 1] ?? BARE_TETHER;
}

/** Whether a half of the companion's kit has opened yet. */
export function skillUnlocked(level: number, which: 'support' | 'passive'): boolean {
  return milestonesUpTo(level).some((entry) => entry.skill === which);
}

/**
 * Flat raid stat points the curve itself has handed over.
 *
 * Returned as a partial rather than a full sheet, so `loadout.ts` can fold it
 * in as one more contribution without this module importing `ZERO_RAID_STATS`
 * and pretending to be a source of every stat.
 */
export function milestoneStats(level: number): Partial<Record<RaidStatKey, number>> {
  const out: Partial<Record<RaidStatKey, number>> = {};
  for (const entry of milestonesUpTo(level)) {
    if (!entry.stat) continue;
    out[entry.stat.key] = (out[entry.stat.key] ?? 0) + entry.stat.points;
  }
  return out;
}

/** Every point the whole curve is worth, for the test that keeps it modest. */
export function totalMilestoneStatPoints(): number {
  return MILESTONES.reduce((sum, entry) => sum + (entry.stat?.points ?? 0), 0);
}
