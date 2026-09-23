import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ACTION_FOR_MOVE, COMPANION_KITS, FALLBACK_KIT_ID, MOVE_KEYS, POTENCY_AT_MAX,
  fireSkill, kitFor, moveKeyFor, moveNamesFor, potencyAt, resolveModifiers, skillForMove, skillsOf,
  withinHours, type CompanionKit, type TurnContext,
} from './companionSkills';
import { MASCOT_ROSTER } from '../../features/pet/mascots/roster';

const ctx = (over: Partial<TurnContext> = {}): TurnContext => ({
  hour: 12, sinceLastUse: 99, spentThisRaid: false, healthFraction: 1, ...over,
});

const kit = (themeId: string): CompanionKit =>
  COMPANION_KITS.find((k) => k.themeId === themeId)!;

describe('moves', () => {
  it('names all four moves for every kit, each one its own', () => {
    const names = COMPANION_KITS.flatMap((k) => MOVE_KEYS.map((m) => k.moves[m].name));
    expect(new Set(names).size).toBe(names.length);
    for (const k of COMPANION_KITS) {
      for (const m of MOVE_KEYS) {
        expect(k.moves[m].name, `${k.themeId} ${m}`).toBeTruthy();
        expect(k.moves[m].description, `${k.themeId} ${m}`).toBeTruthy();
      }
    }
  });

  it('keys the kit names by the C# action ids, and maps every C# style but the couple\'s', () => {
    expect(Object.keys(moveNamesFor(kitFor('pony'))).sort())
      .toEqual(Object.values(ACTION_FOR_MOVE).sort());
    expect(moveNamesFor(kitFor('pony')).spell).toBe('Wishfire');
    expect(moveKeyFor('Physical')).toBe('physical');
    expect(moveKeyFor('Together')).toBeUndefined();
  });

  it('keeps Actions.cs and the kit agreeing on the action ids', () => {
    const cs = readFileSync(resolve(__dirname, '../../../../game/HeartBeat.Game.Core/Actions.cs'), 'utf8');
    for (const id of Object.values(ACTION_FOR_MOVE)) expect(cs).toContain(`Id: "${id}"`);
  });
});

/**
 * The promise NOTICE.md makes, applied to skill kits. A kit is character, not
 * palette — see the same guard on the collectibles and on the mascot roster.
 */
describe('nobody else\'s characters', () => {
  const BORROWED =
    /hello kitty|sanrio|spongebob|squarepants|naruto|uzumaki|shadow clone|rasengan|airbender|aang|appa|avatar state|my little pony|twilight sparkle|rainbow dash|hasbro|pikachu|mickey/i;

  it('names no kit, skill or blurb after anybody else\'s character', () => {
    for (const k of COMPANION_KITS) {
      const text = [
        k.mascot,
        ...MOVE_KEYS.flatMap((m) => [k.moves[m].name, k.moves[m].description]),
        ...skillsOf(k).flatMap((s) => [s.name, s.description, s.vfx, s.id]),
        k.passive.name, k.passive.description, k.passive.id,
      ].join(' | ');
      expect(text, k.themeId).not.toMatch(BORROWED);
    }
  });

  it('belongs to the mascots this repository drew, by name', () => {
    for (const k of COMPANION_KITS) {
      expect(MASCOT_ROSTER[k.themeId], k.themeId).toBeDefined();
      expect(k.mascot).toBe(MASCOT_ROSTER[k.themeId].name);
    }
  });
});

describe('the five kits', () => {
  it('covers every theme, and nothing else', () => {
    expect(COMPANION_KITS.map((k) => k.themeId).sort())
      .toEqual(Object.keys(MASCOT_ROSTER).sort());
  });

  it('gives each one a signature, a support skill and a passive', () => {
    for (const k of COMPANION_KITS) {
      expect(k.signature.name, k.themeId).toBeTruthy();
      expect(k.support.name, k.themeId).toBeTruthy();
      expect(k.passive.name, k.themeId).toBeTruthy();
      expect(Object.keys(k.passive.modifiers).length, k.themeId).toBeGreaterThan(0);
    }
  });

  it('gives every skill its own picture to play', () => {
    const vfx = COMPANION_KITS.flatMap((k) => skillsOf(k).map((s) => s.vfx));
    expect(new Set(vfx).size).toBe(vfx.length);
  });

  it('gives every skill a unique id', () => {
    const ids = COMPANION_KITS.flatMap((k) => [...skillsOf(k).map((s) => s.id), k.passive.id]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /** The reason to own more than one: a week of workouts wants a different
   *  companion from a week of early nights. */
  it('spreads the five signatures across different moves', () => {
    const moves = COMPANION_KITS.map((k) => k.signature.move);
    expect(new Set(moves).size).toBeGreaterThanOrEqual(3);
  });

  it('never hangs a kit\'s two skills off the same move', () => {
    for (const k of COMPANION_KITS) {
      expect(k.signature.move, k.themeId).not.toBe(k.support.move);
    }
  });

  it('keeps every multiplier a lift rather than a penalty', () => {
    for (const k of COMPANION_KITS) {
      for (const s of [...skillsOf(k), k.passive]) {
        for (const key of ['damage', 'shield', 'combo'] as const) {
          const value = s.modifiers[key];
          if (value !== undefined) expect(value, `${k.themeId} ${s.id} ${key}`).toBeGreaterThanOrEqual(1);
        }
        if (s.modifiers.energy !== undefined) expect(s.modifiers.energy).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('makes exactly one skill in the whole roster a once-a-raid one', () => {
    const once = COMPANION_KITS.flatMap(skillsOf).filter((s) => s.oncePerRaid);
    expect(once).toHaveLength(1);
    expect(once[0].name).toBe('Nine Lives');
  });
});

describe('kitFor', () => {
  it('answers with the theme\'s own kit', () => {
    expect(kitFor('pony').mascot).toBe('Wishbell');
    expect(kitFor('shinobi').mascot).toBe('Foxglove');
  });

  it('falls back rather than returning a hole, exactly as the mascot does', () => {
    expect(kitFor('a-theme-that-was-removed').themeId).toBe(FALLBACK_KIT_ID);
    expect(kitFor(undefined).themeId).toBe(FALLBACK_KIT_ID);
  });
});

describe('firing a skill', () => {
  it('fires the skill hung off that move', () => {
    const verdict = fireSkill(kit('pony'), 'magic', ctx());
    expect(verdict.fires).toBe(true);
    if (verdict.fires) expect(verdict.skill.name).toBe('Star Missile');
  });

  it('says why rather than going dead when the kit has nothing for a move', () => {
    const verdict = fireSkill(kit('pony'), 'mend', ctx());
    expect(verdict.fires).toBe(false);
    if (!verdict.fires) expect(verdict.reason).toContain('Wishbell');
  });

  it('holds a skill on cooldown, and counts the turns out loud', () => {
    const verdict = fireSkill(kit('pony'), 'defensive', ctx({ sinceLastUse: 1 }));
    expect(verdict.fires).toBe(false);
    if (!verdict.fires) expect(verdict.reason).toMatch(/ready in 1 turn\./);
  });

  it('refuses a once-a-raid skill that has already gone', () => {
    const fresh = fireSkill(kit('shinobi'), 'physical', ctx());
    expect(fresh.fires).toBe(true);
    const spent = fireSkill(kit('shinobi'), 'physical', ctx({ spentThisRaid: true }));
    expect(spent.fires).toBe(false);
    if (!spent.fires) expect(spent.reason).toContain('once a raid');
  });
});

describe('settling the conditional modifiers', () => {
  it('adds a bonus against a foe the skill is for, and not otherwise', () => {
    const against = fireSkill(kit('pony'), 'magic', ctx({ weakness: 'Mood' }));
    const other = fireSkill(kit('pony'), 'magic', ctx({ weakness: 'Rest' }));
    expect(against.fires && other.fires).toBe(true);
    if (against.fires && other.fires) {
      expect(against.modifiers.damage!).toBeGreaterThan(other.modifiers.damage!);
      // And the condition itself is gone, so nothing downstream re-asks it.
      expect(against.modifiers.favours).toBeUndefined();
    }
  });

  it('pays desperation by how badly the fight has gone', () => {
    const fine = fireSkill(kit('sponge'), 'physical', ctx({ healthFraction: 1 }));
    const rough = fireSkill(kit('sponge'), 'physical', ctx({ healthFraction: 0.5 }));
    expect(fine.fires && rough.fires).toBe(true);
    if (fine.fires && rough.fires) {
      // Ten full five-percent steps of health gone, at 2.5% each.
      expect(rough.modifiers.damage).toBeCloseTo(1.25, 6);
      expect(fine.modifiers.damage).toBeUndefined();
      expect(rough.modifiers.desperation).toBeUndefined();
    }
  });

  it('never pays desperation for health nobody has lost', () => {
    const over = resolveModifiers(
      { desperation: { per: 0.05, gain: 0.025 } },
      ctx({ healthFraction: 1.4 }),
    );
    expect(over.damage).toBeUndefined();
  });

  /**
   * An hour-gated skill still fires outside its hours; it simply does the
   * ordinary amount. Refusing would punish somebody for resting at the wrong
   * time of day, which is exactly backwards for this app.
   */
  it('quiets an hour-gated bonus outside its hours instead of refusing', () => {
    const late = resolveModifiers(
      { healFraction: 0.05, hours: { from: 22, to: 5 } },
      ctx({ hour: 23 }),
    );
    const noon = resolveModifiers(
      { healFraction: 0.05, hours: { from: 22, to: 5 } },
      ctx({ hour: 12 }),
    );
    expect(late.healFraction).toBe(0.05);
    expect(noon.healFraction).toBeUndefined();
    expect(late.hours).toBeUndefined();
  });

  it('knows an hour window that wraps past midnight', () => {
    expect(withinHours(23, { from: 22, to: 5 })).toBe(true);
    expect(withinHours(2, { from: 22, to: 5 })).toBe(true);
    expect(withinHours(5, { from: 22, to: 5 })).toBe(false);
    expect(withinHours(12, { from: 22, to: 5 })).toBe(false);
    expect(withinHours(9, { from: 6, to: 12 })).toBe(true);
    expect(withinHours(30, { from: 6, to: 12 })).toBe(true);
    expect(withinHours(-2, { from: 22, to: 5 })).toBe(true);
  });

  it('leaves what it was handed alone', () => {
    const original = { damage: 1.2, desperation: { per: 0.05, gain: 0.025 } };
    resolveModifiers(original, ctx({ healthFraction: 0.2 }));
    expect(original.desperation).toBeDefined();
    expect(original.damage).toBe(1.2);
  });
});

describe('potency', () => {
  it('is the plain amount at level one and the full lift at the top', () => {
    expect(potencyAt(1)).toBe(1);
    expect(potencyAt(50)).toBeCloseTo(POTENCY_AT_MAX, 6);
  });

  it('climbs, and never past the ceiling or below the floor', () => {
    expect(potencyAt(25)).toBeGreaterThan(potencyAt(10));
    expect(potencyAt(0)).toBe(1);
    expect(potencyAt(9999)).toBeCloseTo(POTENCY_AT_MAX, 6);
  });
});

describe('skillForMove', () => {
  it('finds the skill on a move, and nothing on a move with none', () => {
    expect(skillForMove(kit('kitty'), 'mend')!.name).toBe("Starry Night's Watch");
    expect(skillForMove(kit('kitty'), 'physical')).toBeUndefined();
  });
});
