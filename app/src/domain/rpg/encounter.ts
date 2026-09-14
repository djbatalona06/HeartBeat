import { roll } from '../hash';
import { plainHit, resolveBlow, type Blow } from './boss';
import { canCast, scaleEffect, skillById, type SkillEffect } from './skills';
import type { Enemy } from './enemies';
import { statsWith, type Vigour } from './vigour';
import type { Stats } from './types';

/**
 * One fight in the garden, as a pure reducer.
 *
 * ## Where health lives
 *
 * `boss.ts` opens with the ruling: health exists only inside a boss fight,
 * because "everywhere else the rule holds: no bar to lose, no cost for a missed
 * day". This module extends that rather than reversing it. Health exists only
 * inside an `EncounterState`, a value created by `beginEncounter` and dropped
 * when the overlay unmounts. There is no HP field on `Avatar`, no HP row in
 * Dexie, no HP column in D1, and nothing in `db/` imports this file. Losing
 * costs the fight: the bird is standing in the garden again with everything it
 * walked in with, and the same enemy is still there to try again immediately.
 *
 * That is why the losing outcome is called `'down'` rather than `'lost'`. There
 * is nothing to lose.
 *
 * ## No new damage maths
 *
 * `act` computes no damage. It assembles a `SkillEffect[]` exactly the way the
 * boss panel already does and hands it to `resolveBlow` from `boss.ts`, which is
 * the one place in the app that turns stats and effects into a number. The
 * enemy's swing is `enemy.power` with seeded variance, absorbed by shield first —
 * which is what `Blow.shield` was always for. `clampBlow`/`MAX_BLOW_FRACTION`
 * are deliberately *not* reused: those guard a network boundary, and there is
 * not one here.
 *
 * `Blow.energy` is deliberately ignored inside the reducer. Energy is the one
 * effect that reaches daily life, which makes it a repository write; the overlay
 * reports it out and `db/repository` pays it. Nothing that outlives the fight is
 * decided in here.
 *
 * ## Total, and replayable
 *
 * Every function is total. An action on a finished encounter returns the state
 * unchanged — the real bug class in a fast-tapping overlay — an unknown or
 * unaffordable skill logs a line instead of throwing, and no function reads a
 * clock or draws randomness. Rolls come from `roll(seed, round)`, so the same
 * seed and the same actions replay the same fight, which is the rule
 * `locations.ts:findAt` already states for drops.
 */

export interface Combatant {
  hp: number;
  maxHp: number;
  /** Absorbs the next swing before HP does. Never negative. */
  shield: number;
}

export type Outcome = 'fighting' | 'won' | 'down' | 'fled';

export type Side = 'you' | 'them';

export interface CombatLine {
  round: number;
  who: Side;
  text: string;
}

export interface EncounterState {
  enemyId: string;
  /** Starts at 1 and rises on every resolved action. Seeds the variance. */
  round: number;
  turn: Side;
  you: Combatant;
  them: Combatant;
  log: readonly CombatLine[];
  outcome: Outcome;
  /** Fixed for the life of the encounter. */
  seed: number;
  /** Energy owed to the caster, for the overlay to hand to the repository. */
  energyOwed: number;
}

export type CombatAction =
  | { kind: 'hit' }
  | { kind: 'skill'; skillId: string }
  | { kind: 'flee' };

/** Everything from outside the fight, gathered once before it opens. */
export interface Party {
  /** Already includes gear and vigour — see `statsFor`/`statsWith`. */
  stats: Stats;
  level: number;
  mp: number;
  /** The companion's contribution, if it has one ready. */
  petEffect?: SkillEffect;
}

/** Encounter HP: a flat base, plus heart, plus whatever the streak is worth. */
export const HP_BASE = 40;
export const HP_PER_HEART = 6;

export function encounterHp(stats: Stats, vigour: Vigour): number {
  return HP_BASE + Math.max(0, stats.heart) * HP_PER_HEART + Math.max(0, vigour.hpBonus);
}

/** How much a swing wobbles either side of its flat power. */
export const VARIANCE = 0.2;

/**
 * Who moves first.
 *
 * `luck` against the enemy's `guile`, and a coin flip when guile wins — so a
 * high-guile wasp usually goes first but never always. `luck` is the right stat
 * because its own doc comment reserves it for nudges that are "never a payout",
 * and turn order is not a payout. See the note in `enemies.ts` on why there is
 * no fifth stat.
 */
export function firstMover(stats: Stats, enemy: Enemy, seed: number): Side {
  if (stats.luck >= enemy.guile) return 'you';
  return roll(seed, 0) < 0.5 ? 'you' : 'them';
}

/** Odds of getting away. Never zero, never certain. */
export function fleeChance(stats: Stats, enemy: Enemy): number {
  const edge = (stats.luck - enemy.guile) * 0.05;
  return Math.min(0.9, Math.max(0.35, 0.6 + edge));
}

function line(round: number, who: Side, text: string): CombatLine {
  return { round, who, text };
}

/** A fresh fight. Pure: the same arguments give the same opening state. */
export function beginEncounter(enemy: Enemy, party: Party, vigour: Vigour, seed: number): EncounterState {
  const stats = statsWith(party.stats, vigour);
  const maxHp = encounterHp(stats, vigour);
  return {
    enemyId: enemy.id,
    round: 1,
    turn: firstMover(stats, enemy, seed),
    you: { hp: maxHp, maxHp, shield: 0 },
    them: { hp: enemy.maxHp, maxHp: enemy.maxHp, shield: 0 },
    log: [line(1, 'them', enemy.blurb)],
    outcome: 'fighting',
    seed,
    energyOwed: 0,
  };
}

/** Take damage, shield first. Returns the combatant and what actually landed. */
function absorb(target: Combatant, damage: number): { next: Combatant; dealt: number; blocked: number } {
  const safe = Number.isFinite(damage) ? Math.max(0, Math.round(damage)) : 0;
  const blocked = Math.min(target.shield, safe);
  const dealt = safe - blocked;
  return {
    next: { ...target, hp: Math.max(0, target.hp - dealt), shield: target.shield - blocked },
    dealt,
    blocked,
  };
}

function settle(state: EncounterState): EncounterState {
  if (state.them.hp <= 0) return { ...state, outcome: 'won' };
  if (state.you.hp <= 0) return { ...state, outcome: 'down' };
  return state;
}

/** The enemy's move. Its own function so the overlay can pace the two apart. */
export function enemyMove(state: EncounterState, enemy: Enemy): EncounterState {
  if (state.outcome !== 'fighting' || state.turn !== 'them') return state;

  const wobble = 1 + (roll(state.seed, state.round * 2 + 1) * 2 - 1) * VARIANCE;
  // A defensive enemy sometimes holds back and puts the turn into a guard
  // instead, which is the whole of the AI: three behaviours, no planner.
  const guarding = enemy.ai === 'defensive' && roll(state.seed, state.round * 2 + 2) < 0.25;
  const erratic = enemy.ai === 'erratic' ? roll(state.seed, state.round * 2 + 3) : 1;
  const swing = enemy.ai === 'erratic' && erratic < 0.3
    ? 0
    : Math.round(enemy.power * wobble * (enemy.ai === 'aggressive' ? 1.15 : 1));

  if (guarding) {
    return settle({
      ...state,
      them: { ...state.them, shield: state.them.shield + Math.max(1, Math.round(enemy.power / 2)) },
      turn: 'you',
      round: state.round + 1,
      log: [...state.log, line(state.round, 'them', `${enemy.name} draws in and waits.`)],
    });
  }

  if (swing <= 0) {
    return settle({
      ...state,
      turn: 'you',
      round: state.round + 1,
      log: [...state.log, line(state.round, 'them', `${enemy.name} goes for it and misses.`)],
    });
  }

  const { next, dealt, blocked } = absorb(state.you, swing);
  const text = blocked > 0
    ? `${enemy.name} hits for ${dealt}. Your ward takes ${blocked}.`
    : `${enemy.name} hits for ${dealt}.`;
  return settle({
    ...state,
    you: next,
    turn: 'you',
    round: state.round + 1,
    log: [...state.log, line(state.round, 'them', text)],
  });
}

/**
 * One action from the player.
 *
 * Returns the state untouched when the fight is over or it is not your turn, so
 * a double tap costs nothing. MP is *not* deducted here — spending it is a
 * repository write, so the overlay does that and passes the remaining `mp` in
 * `party`; this function only refuses a cast the party cannot afford.
 */
export function act(
  state: EncounterState,
  action: CombatAction,
  enemy: Enemy,
  party: Party,
): EncounterState {
  if (state.outcome !== 'fighting' || state.turn !== 'you') return state;

  if (action.kind === 'flee') {
    const got = roll(state.seed, state.round * 2) < fleeChance(party.stats, enemy);
    if (got) {
      return {
        ...state,
        outcome: 'fled',
        log: [...state.log, line(state.round, 'you', 'You back away, and it lets you.')],
      };
    }
    return {
      ...state,
      turn: 'them',
      log: [...state.log, line(state.round, 'you', 'You try to back away. It follows.')],
    };
  }

  const effects: SkillEffect[] = [];
  let cast: string | null = null;

  if (action.kind === 'skill') {
    const skill = skillById(action.skillId);
    if (!skill) {
      return {
        ...state,
        log: [...state.log, line(state.round, 'you', 'Nothing happens.')],
      };
    }
    if (!canCast(skill, party.level, party.mp)) {
      // The `spend`-returns-null convention: refuse, say so, cost no turn.
      return {
        ...state,
        log: [...state.log, line(state.round, 'you', `${skill.name} will not come.`)],
      };
    }
    effects.push(scaleEffect(skill.effect, party.stats));
    cast = skill.name;
  }

  if (party.petEffect) effects.push(party.petEffect);

  const blow: Blow = resolveBlow(party.stats, effects);
  const { next: them, dealt, blocked } = absorb(state.them, blow.damage);
  const you: Combatant = {
    ...state.you,
    shield: state.you.shield + Math.max(0, blow.shield),
    hp: Math.min(state.you.maxHp, state.you.hp + Math.max(0, blow.heal)),
  };

  const parts = [cast ? `${cast} lands for ${dealt}.` : `You hit for ${dealt}.`];
  if (blocked > 0) parts.push(`${blocked} turned aside.`);
  if (blow.shield > 0) parts.push(`+${blow.shield} ward.`);
  if (blow.heal > 0) parts.push(`+${blow.heal} back.`);

  return settle({
    ...state,
    you,
    them,
    turn: 'them',
    energyOwed: state.energyOwed + Math.max(0, blow.energy),
    log: [...state.log, line(state.round, 'you', parts.join(' '))],
  });
}

/** Plain hits left, for the "is this going anywhere" read. Mirrors `hitsToClear`. */
export function hitsLeft(state: EncounterState, stats: Stats): number {
  return Math.ceil(state.them.hp / Math.max(1, plainHit(stats)));
}

export function hpFractionOf(who: Combatant): number {
  if (who.maxHp <= 0) return 0;
  return Math.max(0, Math.min(1, who.hp / who.maxHp));
}
