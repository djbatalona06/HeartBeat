import type { DayKey, MemberId } from '../types';
import { addDays, daysBetween } from '../day';

/**
 * What the couple's pet is made of: three attributes, a shared streak, and a
 * glow — all of them *derived*, none of them stored.
 *
 * The pet already had one number, `Pet.xp`, and getting that number to be
 * genuinely shared cost the app an award queue, a dedup list bounded at 32
 * ids, a server-side `xp = xp + ?` and a merge rule that nothing may lower
 * (see `db/repository/petXp.ts`). That machinery exists because XP is
 * *additive*: two phones each adding to a counter and pushing the result lose
 * one partner's gains.
 *
 * Three more counters would need three more copies of all of it. So these are
 * not counters. Every number here is computed from the day log the two phones
 * already reconcile — moods, workouts, cycle check-ins, keyed by day and by
 * member — which makes them shared for free and idempotent by construction. A
 * day logged twice, a sync replayed, an award reported by both phones: all of
 * them land on the same set of days and therefore the same totals. There is
 * nothing to double-count because there is nothing to count *up*.
 *
 * The division of labour, then: `Pet.xp` is what the couple have been *given*
 * (quests, boss victories, tasks), and this is what they have *done*. The
 * first needs a ledger; the second needs only arithmetic.
 *
 * Pure, and deliberately ignorant of Dexie: `db/repository/vitals.ts` reads the
 * rows, this decides what they mean.
 */

export type Attribute = 'vitality' | 'serenity' | 'bond';

export interface Attributes {
  /** Workouts. The pet's energy and playfulness. */
  vitality: number;
  /** Moods and check-ins. The pet's calm, and its colour. */
  serenity: number;
  /** Days you both showed up. The pet's affection. */
  bond: number;
}

export const ZERO_ATTRIBUTES: Attributes = { vitality: 0, serenity: 0, bond: 0 };

/** The three day-keyed logs both phones already sync. */
export type LogKind = 'mood' | 'exercise' | 'cycle';

/** One person's logging on one day. Built by the repository, one row per pair. */
export interface DayLog {
  day: DayKey;
  memberId: MemberId;
  kinds: LogKind[];
}

/**
 * What each kind of log feeds.
 *
 * A workout is vitality and a mood is serenity, which is the mapping that makes
 * the pet readable as a dashboard: a bird that is bright but restless is a
 * couple who have been moving and not talking. The cycle check-in pays into
 * serenity at a lower rate rather than into a fourth attribute of its own,
 * because only one of the two may be tracking it and an attribute one partner
 * structurally cannot feed would be an unwinnable bar.
 *
 * Every log also pays a single point of bond. It is small on purpose: the real
 * bond comes from `TOGETHER_BOND` below, and this is only here so that a day
 * one of you carried alone still moves the third bar a little.
 */
export const AWARDS: Record<LogKind, Attributes> = {
  exercise: { vitality: 12, serenity: 0, bond: 1 },
  mood: { vitality: 0, serenity: 10, bond: 1 },
  cycle: { vitality: 0, serenity: 4, bond: 1 },
};

/**
 * What a day both of you logged is worth, on top of what each log paid.
 *
 * This is the one number in the file that makes the game cooperative rather
 * than parallel, and it is larger than any single log for that reason: the
 * best thing either partner can do for the pet is not another workout, it is
 * the other partner opening the app. Paid per *day*, not per pair of logs, so
 * it cannot be farmed by logging four things each.
 */
export const TOGETHER_BOND = 10;

/**
 * Which members logged anything on each day.
 *
 * The one walk every derived number in this file starts from, and the same one
 * `together.ts` starts from. It used to be written out twice here — once in
 * `attributesOf` and once in `vitalsOf` — which is two places for the rule
 * "a day both of you showed up" to be stated, and therefore two places for it
 * to drift apart.
 *
 * A day with an empty `kinds` array is not a day anybody showed up on, so it
 * never reaches the map.
 */
export function dayMembers(logs: readonly DayLog[]): Map<DayKey, Set<MemberId>> {
  const members = new Map<DayKey, Set<MemberId>>();
  for (const log of logs) {
    if (log.kinds.length === 0) continue;
    const seen = members.get(log.day) ?? new Set<MemberId>();
    seen.add(log.memberId);
    members.set(log.day, seen);
  }
  return members;
}

/** A day both of you logged something. The one definition of "together". */
export function isDuoDay(members: ReadonlySet<MemberId>): boolean {
  return members.size >= 2;
}

/**
 * `members` is accepted so a caller that has already walked the log — `vitalsOf`
 * below — does not pay for a second walk to get the same map back.
 */
export function attributesOf(
  logs: readonly DayLog[],
  members: Map<DayKey, Set<MemberId>> = dayMembers(logs),
): Attributes {
  const total = { ...ZERO_ATTRIBUTES };

  for (const log of logs) {
    for (const kind of log.kinds) {
      const award = AWARDS[kind];
      if (!award) continue;
      total.vitality += award.vitality;
      total.serenity += award.serenity;
      total.bond += award.bond;
    }
  }

  for (const seen of members.values()) {
    if (isDuoDay(seen)) total.bond += TOGETHER_BOND;
  }
  return total;
}

export function totalXp(attributes: Attributes): number {
  return attributes.vitality + attributes.serenity + attributes.bond;
}

/* ---- the shared streak ---------------------------------------------------- */

/**
 * One shield per this many days you both logged, which is why they are earned
 * by the pair and not by a person: insurance against one of you missing a day
 * should be paid for by the days you did not.
 */
export const SHIELD_EVERY = 5;
export const MAX_SHIELDS = 2;

/** Far enough back to hold any streak a couple could plausibly have. */
const MAX_LOOKBACK = 730;

export interface StreakState {
  /** Days in a row at least one of you logged something. */
  days: number;
  /** Shields this streak is currently leaning on. */
  shieldsSpent: number;
  /** Shields still in hand. */
  shieldsLeft: number;
  /** True once today itself is on the board. */
  loggedToday: boolean;
}

/**
 * Shields earned so far: one per `SHIELD_EVERY` days both partners logged,
 * capped. Capped rather than accumulating because a couple six months in would
 * otherwise be carrying a fortnight of immunity, and a streak that cannot break
 * is not a streak.
 */
export function shieldsEarned(bothLoggedDays: number): number {
  return Math.min(MAX_SHIELDS, Math.floor(Math.max(0, bothLoggedDays) / SHIELD_EVERY));
}

/**
 * The couple's streak, walked backwards from today.
 *
 * Two rules make this kind rather than punishing, and both are deliberate:
 *
 * **Today is not a miss until it is over.** A day with nothing in it yet is
 * skipped rather than counted against you — otherwise the streak everybody
 * built yesterday reads as broken every morning until somebody logs.
 *
 * **At least one of you is enough.** This is the whole cooperative premise: if
 * one partner is ill, travelling, or simply having a week, the other can carry
 * the day for both, and nothing anywhere records which of them it was. There is
 * no per-person streak here to lose, so there is nobody to have broken it.
 *
 * A shield then covers a single missed day. Only one in a row: two shields will
 * not paper over a weekend away, because at that point the honest thing is a
 * new streak rather than a fiction.
 */
export function sharedStreak(
  logged: ReadonlySet<DayKey>,
  today: DayKey,
  shields: number,
): StreakState {
  const loggedToday = logged.has(today);
  let cursor = loggedToday ? today : addDays(today, -1);
  let days = 0;
  let spent = 0;
  // A shield laid over a gap is not paid for until the walk finds another
  // logged day behind it. Every streak ends at a missed day — the one before it
  // began — so charging on sight would bill every couple a shield for the gap
  // at the far end of their own history, and a seven-day streak would come back
  // with nothing in hand.
  let pending = 0;
  let coveredLast = false;

  for (let step = 0; step < MAX_LOOKBACK; step += 1) {
    if (logged.has(cursor)) {
      days += 1;
      spent += pending;
      pending = 0;
      coveredLast = false;
      cursor = addDays(cursor, -1);
      continue;
    }
    // Nothing behind it to protect, no cover left, or the day before this one
    // was already covered — any of the three ends the run here.
    if (days === 0 || spent + pending >= shields || coveredLast) break;
    pending += 1;
    coveredLast = true;
    cursor = addDays(cursor, -1);
  }

  return { days, shieldsSpent: spent, shieldsLeft: Math.max(0, shields - spent), loggedToday };
}

/* ---- radiance ------------------------------------------------------------- */

/**
 * The glow, and the floor under it.
 *
 * Bondly's version of this mechanic makes the *partner's* pet visibly sad when
 * you skip, which is accountability by guilt, and guilt is the one thing a
 * couples app cannot afford to manufacture. So there is no sad state here at
 * all: the pet dims towards a floor it never falls through, and brightens the
 * moment either of you logs anything. The absence of a glow is noticeable; it
 * is not an accusation, and there is no screen anywhere that says whose fault
 * it was.
 */
export const RADIANCE_FULL = 100;
export const RADIANCE_FLOOR = 40;
export const RADIANCE_DECAY = 12;

export function radianceFor(lastLogged: DayKey | null, today: DayKey): number {
  if (!lastLogged) return RADIANCE_FLOOR;
  const idle = Math.max(0, daysBetween(lastLogged, today));
  return Math.max(RADIANCE_FLOOR, RADIANCE_FULL - idle * RADIANCE_DECAY);
}

/* ---- evolution ------------------------------------------------------------ */

export interface VitalStage {
  id: 'egg' | 'hatchling' | 'juvenile' | 'adult' | 'elder';
  name: string;
  blurb: string;
  /** Combined vitality + serenity + bond needed. */
  xp: number;
  /** Shared streak needed alongside the XP. */
  streak: number;
  /** True when the stage also asks that both of you logged in the last week. */
  bothRecently: boolean;
}

/**
 * The stages, hardest last.
 *
 * Every gate past the first asks for something one person cannot supply alone —
 * a streak, or both of you inside the same week. That is the point: the pet is
 * the couple's, so it should not be possible for one partner to raise it while
 * the other watches. It is also why the requirements are ANDed rather than
 * summed: XP alone would let a fortnight of one person's workouts buy a stage.
 */
export const STAGES: readonly VitalStage[] = [
  { id: 'egg', name: 'Egg', blurb: 'Something is in there.', xp: 0, streak: 0, bothRecently: false },
  { id: 'hatchling', name: 'Hatchling', blurb: 'Out, and unsteady.', xp: 100, streak: 0, bothRecently: false },
  { id: 'juvenile', name: 'Juvenile', blurb: 'Playing, and watching you both.', xp: 500, streak: 7, bothRecently: false },
  { id: 'adult', name: 'Adult', blurb: 'Grown, on the two of you.', xp: 1500, streak: 7, bothRecently: true },
  { id: 'elder', name: 'Elder', blurb: 'A month of you, and still here.', xp: 5000, streak: 30, bothRecently: true },
];

export interface StageInput {
  xp: number;
  streak: number;
  /** Both partners logged something inside the last seven days. */
  bothRecently: boolean;
}

function meets(stage: VitalStage, at: StageInput): boolean {
  if (at.xp < stage.xp) return false;
  if (at.streak < stage.streak) return false;
  return !stage.bothRecently || at.bothRecently;
}

export function stageFor(at: StageInput): VitalStage {
  for (let i = STAGES.length - 1; i > 0; i -= 1) {
    if (meets(STAGES[i], at)) return STAGES[i];
  }
  return STAGES[0];
}

/** The next stage and what it is still waiting on, or null at the top. */
export function nextStage(at: StageInput): VitalStage | null {
  const here = stageFor(at);
  const index = STAGES.findIndex((stage) => stage.id === here.id);
  return index >= 0 && index < STAGES.length - 1 ? STAGES[index + 1] : null;
}

/**
 * What the next stage is still short of, in the couple's own words. Empty when
 * everything is met, or when there is no next stage.
 */
export function remainingFor(at: StageInput): string[] {
  const next = nextStage(at);
  if (!next) return [];
  const short: string[] = [];
  if (at.xp < next.xp) short.push(`${next.xp - at.xp} more XP together`);
  if (at.streak < next.streak) short.push(`a ${next.streak}-day shared streak`);
  if (next.bothRecently && !at.bothRecently) short.push('both of you logging this week');
  return short;
}

/* ---- the whole picture ---------------------------------------------------- */

export interface Vitals {
  attributes: Attributes;
  xp: number;
  streak: StreakState;
  radiance: number;
  stage: VitalStage;
  next: VitalStage | null;
  remaining: string[];
  /** Days where both of you logged something. What earns shields. */
  togetherDays: number;
  /** Both partners logged inside the last seven days. */
  bothRecently: boolean;
}

/** How recent "recently" is, for the stage gate that asks for both of you. */
export const TOGETHER_WINDOW_DAYS = 7;

/**
 * Everything above, in one pass over the day log.
 *
 * One function rather than five calls at the screen, because four of the five
 * answers depend on the same two derived sets — which days have anything in
 * them, and which have both of you — and a screen that rebuilt those per bar
 * would walk the log five times to say one thing.
 */
export function vitalsOf(logs: readonly DayLog[], today: DayKey): Vitals {
  const members = dayMembers(logs);

  const logged = new Set(members.keys());
  const togetherDays = [...members.values()].filter(isDuoDay).length;

  const recent = new Set<MemberId>();
  for (const [day, seen] of members) {
    if (daysBetween(day, today) < TOGETHER_WINDOW_DAYS) for (const m of seen) recent.add(m);
  }

  const attributes = attributesOf(logs, members);
  const xp = totalXp(attributes);
  const streak = sharedStreak(logged, today, shieldsEarned(togetherDays));

  // The most recent day with anything in it, which is what the glow tracks.
  // Days ahead of today (a phone in another timezone, a clock set forward) are
  // ignored rather than treated as "logged today".
  let lastLogged: DayKey | null = null;
  for (const day of logged) {
    if (daysBetween(day, today) < 0) continue;
    if (lastLogged === null || day > lastLogged) lastLogged = day;
  }

  const at: StageInput = { xp, streak: streak.days, bothRecently: recent.size >= 2 };
  return {
    attributes,
    xp,
    streak,
    radiance: radianceFor(lastLogged, today),
    stage: stageFor(at),
    next: nextStage(at),
    remaining: remainingFor(at),
    togetherDays,
    bothRecently: at.bothRecently,
  };
}
