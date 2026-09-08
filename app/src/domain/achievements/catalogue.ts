/**
 * What the couple can be recognised for.
 *
 * Achievements here are Habitica's shape read in Finch's manner: they mark
 * something that already happened and pay a little XP for it. There is nothing
 * to lose, no streak that punishes a bad week, and no tier that expires. A
 * counter only ever goes up, so a fortnight of not opening the app costs
 * nothing but time.
 *
 * The catalogue is data, not behaviour: `unlock.ts` decides what is earned and
 * `repository.ts` is the only thing that writes. Keeping the definitions inert
 * is what lets the shelf render one and the writer award it from the same list.
 */

/**
 * The counters an achievement can be about, and the whole of them.
 *
 * The list is the source of the type rather than the other way round, so a
 * measure cannot be named in a definition without existing on the state, and
 * cannot be added to the state without a test noticing.
 *
 * - `moodDays`      days with a mood logged
 * - `exerciseDays`  days with a workout logged
 * - `proofDays`     days with camera proof on them
 * - `tasksFinished` distinct tasks that have been completed at least once
 * - `bestStreak`    the longest streak standing on any one task
 * - `events`        calendar events on the couple's days
 * - `cycleDays`     days of cycle logging
 * - `notes`         notes sent between the two phones
 * - `vibesSent`     Good Vibes sent to the other person
 * - `pets`          companions hatched
 * - `gearWorn`      slots filled on the character sheet
 * - `petLevel`      the shared pet's level
 *
 * Every one is a lifetime total. That is the design: a total cannot fall, so
 * nothing here can take a tier back once it has been given.
 */
export const NO_PROGRESS_KEYS = [
  'moodDays',
  'exerciseDays',
  'proofDays',
  'tasksFinished',
  'bestStreak',
  'events',
  'cycleDays',
  'notes',
  'vibesSent',
  'pets',
  'gearWorn',
  'petLevel',
] as const;

export type Measure = (typeof NO_PROGRESS_KEYS)[number];

/** Every counter, all numbers, none of them ever negative. */
export type AchievementState = Record<Measure, number>;

/** A tier is a rung, not a rank: three of them, each a little further out. */
export type Tier = 1 | 2 | 3;

export interface AchievementDef {
  /** Stable across renames — this is what is stored on the row. */
  code: string;
  /** Which run of three this belongs to, for grouping on the shelf. */
  track: string;
  /** The name of the run, shown once above its tiers. */
  trackTitle: string;
  tier: Tier;
  title: string;
  /** One line, in the app's voice: what happened, not what to do next. */
  blurb: string;
  /** Which counter, and how much of it. */
  measure: Measure;
  need: number;
}

/**
 * What each tier pays.
 *
 * Deliberately small next to a quest or a boss. An achievement is a note that
 * something happened; it should never be the efficient way to level, or the
 * app starts rewarding the checking rather than the doing.
 */
export const TIER_PAYOUT: Record<Tier, number> = { 1: 20, 2: 45, 3: 90 };

/** A run of three rungs on one counter, written as one line each. */
function track(
  track: string,
  trackTitle: string,
  measure: Measure,
  rungs: ReadonlyArray<readonly [need: number, title: string, blurb: string]>,
): AchievementDef[] {
  return rungs.map(([need, title, blurb], i) => ({
    code: `${track}.${i + 1}`,
    track,
    trackTitle,
    tier: (i + 1) as Tier,
    title,
    blurb,
    measure,
    need,
  }));
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  ...track('mood', 'Saying how it is', 'moodDays', [
    [1, 'First answer', 'You told the app how the day went.'],
    [15, 'A fortnight of honesty', 'Fifteen days answered.'],
    [60, 'Two months in', 'Sixty days of saying how it was.'],
  ]),
  ...track('exercise', 'Moving', 'exerciseDays', [
    [1, 'Off the sofa', 'One workout logged.'],
    [12, 'A dozen', 'Twelve days of moving.'],
    [50, 'Fifty', 'Fifty workouts behind you.'],
  ]),
  ...track('proof', 'Showing your work', 'proofDays', [
    [1, 'Say cheese', 'The first proof, taken and kept.'],
    [10, 'Ten for the album', 'Ten days with the camera out.'],
    [40, 'Forty', 'Forty days of proof.'],
  ]),
  // Distinct tasks, not completions: a daily completed every day for a year is
  // one task here. That is why `bestStreak` exists next to it — between them
  // they cover both the doing of many things and the keeping at one.
  ...track('tasks', 'Getting it done', 'tasksFinished', [
    [3, 'Three done', 'Three different things crossed off.'],
    [25, 'Twenty-five', 'Twenty-five tasks finished at least once.'],
    [100, 'A hundred', 'A hundred different things seen through.'],
  ]),
  ...track('streak', 'Keeping at it', 'bestStreak', [
    [3, 'Three in a row', 'A daily held for three days.'],
    [10, 'Ten in a row', 'Ten straight days on one thing.'],
    [30, 'A month of it', 'Thirty consecutive days.'],
  ]),
  ...track('calendar', 'Making plans', 'events', [
    [1, 'Something in the diary', 'The first thing worth writing down.'],
    [20, 'A full month', 'Twenty things planned.'],
    [100, 'A hundred plans', 'A hundred entries on the calendar.'],
  ]),
  ...track('cycle', 'Keeping track', 'cycleDays', [
    [1, 'Logged', 'The first day tracked.'],
    [30, 'A cycle through', 'Thirty days of tracking.'],
    [120, 'Four months', 'A hundred and twenty days.'],
  ]),
  ...track('notes', 'Talking', 'notes', [
    [1, 'First word', 'You left the other phone a note.'],
    [25, 'Twenty-five notes', 'A conversation, at this point.'],
    [150, 'A hundred and fifty', 'Rather a lot to say to each other.'],
  ]),
  ...track('vibes', 'Being kind', 'vibesSent', [
    [1, 'A good vibe', 'You sent one for no reason at all.'],
    [10, 'Ten of them', 'Ten unprompted kindnesses.'],
    [40, 'Forty', 'Forty times you thought of them first.'],
  ]),
  ...track('pets', 'The menagerie', 'pets', [
    [1, 'Something hatched', 'Your first companion.'],
    [5, 'Five of them', 'Five companions to choose between.'],
    [15, 'Fifteen', 'A proper menagerie.'],
  ]),
  ...track('gear', 'Dressed for it', 'gearWorn', [
    [1, 'Something equipped', 'One slot filled.'],
    [3, 'Half kitted', 'Three slots at once.'],
    [5, 'Fully equipped', 'Every slot filled at the same time.'],
  ]),
  ...track('pet', 'The two of you', 'petLevel', [
    [2, 'It grew', 'The pet you share reached level two.'],
    [10, 'Level ten', 'Ten levels, between the both of you.'],
    [25, 'Level twenty-five', 'A long way from the egg.'],
  ]),
];

/** What one definition pays, from its tier. */
export function payoutOf(def: AchievementDef): number {
  return TIER_PAYOUT[def.tier];
}

export function achievementByCode(code: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.code === code);
}

/** The tracks in catalogue order, each with its three rungs. */
export function tracks(): Array<{ track: string; trackTitle: string; tiers: AchievementDef[] }> {
  const out: Array<{ track: string; trackTitle: string; tiers: AchievementDef[] }> = [];
  for (const def of ACHIEVEMENTS) {
    const last = out[out.length - 1];
    if (last && last.track === def.track) last.tiers.push(def);
    else out.push({ track: def.track, trackTitle: def.trackTitle, tiers: [def] });
  }
  return out;
}
