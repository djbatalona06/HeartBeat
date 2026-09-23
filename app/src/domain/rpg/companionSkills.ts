import type { Element, MoveStyle } from '../../features/eve-garden/engine/types';

/**
 * One skill kit per mascot: the moves it fights with, and what it adds on top.
 *
 * ## The moves
 *
 * Every companion fights with the same four kinds of move — physical,
 * defensive, magic and a mend — because the fight's arithmetic lives in C#
 * and is the same whoever you bring. What a kit gives them is a *name* and a
 * picture: Wishbell's magic is Wishfire, Foxglove's is Foxfire, and they land
 * the same way. The move bar reads these names; the battle log carries them
 * across as `moveNames`.
 *
 * Logging is not a move. A workout, a study session or a night's sleep logged
 * today is a *charge* (`domain/rpg/charges.ts`) that changes how the moves
 * land, which is what lets a button be pressed as often as a fight needs.
 *
 * ## The skills
 *
 * On top of the moves, each kit has a signature and a support skill hung off
 * one move each, plus an always-on passive. Three, because a signature alone
 * is a costume: you would pick a companion once, watch its animation, and
 * never think about it again.
 *
 * ## The names, and the line this file does not cross
 *
 * The five themes are named after shows somebody else owns, and the app says so
 * in NOTICE.md. A **palette** may be named that way; a character you take into
 * a fight may not, and a *skill kit* is character, not palette. So these kits
 * belong to the five originals in `features/pet/mascots/` — Wishbell, Cirrus,
 * Marigold, Mochi, Foxglove — and are written to each one's own spirit. Where a
 * skill's shape came from a rights holder's character, the shape is kept and
 * the name is this repository's own. `companionSkills.test.ts` fails if a
 * rights holder's name appears anywhere in here, exactly as `pets.test.ts`
 * already does for the collectibles.
 */

/** The four moves a kit names. Together is the couple's, and nobody's to rename. */
export type MoveKey = 'physical' | 'defensive' | 'magic' | 'mend';

export const MOVE_KEYS: readonly MoveKey[] = ['physical', 'defensive', 'magic', 'mend'];

export const MOVE_STYLE_NAMES: Record<MoveKey, string> = {
  physical: 'Physical',
  defensive: 'Defensive',
  magic: 'Magic',
  mend: 'Mend',
};

/** The kit's key for a C# move style, or nothing for the couple's move. */
export function moveKeyFor(style: MoveStyle): MoveKey | undefined {
  switch (style) {
    case 'Physical': return 'physical';
    case 'Defensive': return 'defensive';
    case 'Magic': return 'magic';
    case 'Mend': return 'mend';
    default: return undefined;
  }
}

/** The C# action ids, by the move they are. Mirrors `Actions.cs`. */
export const ACTION_FOR_MOVE: Record<MoveKey, string> = {
  physical: 'strike',
  defensive: 'guard',
  magic: 'spell',
  mend: 'mend',
};

export interface KitMove {
  name: string;
  /** One line, in the companion's own voice. */
  description: string;
}

/**
 * What a skill does, on top of the turn it is attached to.
 *
 * Multipliers are multipliers and flats are flats, and the two are deliberately
 * separate fields rather than one clever number: `damage: 1.3` reads as "thirty
 * percent more" wherever it appears, and nothing in this file has to remember
 * whether a given key was additive.
 */
export interface SkillModifiers {
  /** Multiplies the turn's damage. */
  damage?: number;
  /** Multiplies the turn's shield. */
  shield?: number;
  /** Multiplies resonance gained this turn. */
  combo?: number;
  /** Flat Energy handed back. Never subtracts — see `types.ts`. */
  energy?: number;
  /** Resilience restored, as a fraction of the party's maximum. */
  healFraction?: number;
  /** Of the boss's next hit, the fraction thrown back at it. */
  reflect?: number;
  /** Taken off the accuracy of the boss's next attack. */
  accuracyDebuff?: number;
  /**
   * Extra damage that grows as the fight goes badly: `gain` more damage for
   * every `per` of the party's health already lost. The one modifier that pays
   * for a bad fight rather than a good one.
   */
  desperation?: { per: number; gain: number };
  /**
   * Resilience cannot fall below one while this is up. The only thing in the
   * app that looks like a death save, and it lasts exactly one turn.
   */
  holdTheLine?: boolean;
  /** Only fires between these hours, inclusive of the first and exclusive of
   *  the second, wrapping past midnight. Absent means any hour. */
  hours?: { from: number; to: number };
  /** Extra damage against a boss whose weakness is this element. */
  favours?: Element;
}

export interface CompanionSkill {
  id: string;
  name: string;
  description: string;
  /** Which move it rides on. */
  move: MoveKey;
  /** What `scene/` plays. A key, not a path — the scene owns the drawing. */
  vfx: string;
  modifiers: SkillModifiers;
  /** Turns before it can fire again. Zero means every turn. */
  cooldown: number;
  /** One use per raid, whatever the cooldown says. */
  oncePerRaid: boolean;
}

export interface CompanionPassive {
  id: string;
  name: string;
  description: string;
  modifiers: SkillModifiers;
}

export interface CompanionKit {
  /** `Theme.id`, and the key `MASCOT_ROSTER` uses. One registry, two readers. */
  themeId: string;
  /** The mascot's own name, repeated here so a test can hold the two together. */
  mascot: string;
  moves: Record<MoveKey, KitMove>;
  signature: CompanionSkill;
  support: CompanionSkill;
  passive: CompanionPassive;
}

/**
 * The five kits.
 *
 * Each signature rides a different move, which is the reason to own more than
 * one companion: a couple who fight with magic want a different one from a
 * couple who would rather hit things.
 */
export const COMPANION_KITS: readonly CompanionKit[] = [
  {
    themeId: 'pony',
    mascot: 'Wishbell',
    moves: {
      physical: {
        name: 'Hoofbeat',
        description: 'A quick double stamp. Small hooves, surprisingly firm opinions.',
      },
      defensive: {
        name: 'Bell Ward',
        description: 'Rings the bell on her mane; the sound hangs in the air and holds.',
      },
      magic: {
        name: 'Wishfire',
        description: 'A spark off the horn that goes exactly where she hoped it would.',
      },
      mend: {
        name: 'Wish Upon',
        description: 'Spends a little of the wish she keeps spare, on you.',
      },
    },
    signature: {
      id: 'star-missile',
      name: 'Star Missile',
      description:
        'A bolt off the horn. Lands hardest on the things that are only in your head, '
        + 'and leaves a trail the tether charges along.',
      move: 'magic',
      vfx: 'horn-bolt',
      modifiers: { damage: 1.25, combo: 1.4, favours: 'Mood' },
      cooldown: 0,
      oncePerRaid: false,
    },
    support: {
      id: 'one-wish-spare',
      name: 'One Wish Spare',
      description: 'Keeps a little back. Nothing is spent on a day that did not need it.',
      move: 'defensive',
      vfx: 'held-spark',
      modifiers: { combo: 1.6, energy: 2 },
      cooldown: 2,
      oncePerRaid: false,
    },
    passive: {
      id: 'horn-glow',
      name: 'Horn Glow',
      description: 'The tether charges a little faster with her in the field.',
      modifiers: { combo: 1.08 },
    },
  },

  {
    themeId: 'avatar',
    mascot: 'Cirrus',
    moves: {
      physical: {
        name: 'Tail Lash',
        description: 'A long curl of cloud, snapped straight.',
      },
      defensive: {
        name: 'Wind Wall',
        description: 'Coils round the two of you and keeps turning.',
      },
      magic: {
        name: 'Thunderhead',
        description: 'Gathers the high weather into one grumble and lets it go.',
      },
      mend: {
        name: 'Soft Rain',
        description: 'Brings a little of the sky down, gently, where it is needed.',
      },
    },
    signature: {
      id: 'winds-grace',
      name: "Wind's Grace",
      description:
        'The shield is moving air rather than a wall, so some of what hits it '
        + 'goes back the way it came.',
      move: 'defensive',
      vfx: 'ring-of-wind',
      modifiers: { shield: 1.2, reflect: 0.25 },
      cooldown: 0,
      oncePerRaid: false,
    },
    support: {
      id: 'updraft',
      name: 'Updraft',
      description: 'Picks you up off the floor of the day without you having to climb.',
      move: 'mend',
      vfx: 'rising-current',
      modifiers: { energy: 6, healFraction: 0.08 },
      cooldown: 2,
      oncePerRaid: false,
    },
    passive: {
      id: 'thermals',
      name: 'Thermals',
      description: 'Every shield holds a little more than it looks like it should.',
      modifiers: { shield: 1.07 },
    },
  },

  {
    themeId: 'sponge',
    mascot: 'Marigold',
    moves: {
      physical: {
        name: 'Sponge Slam',
        description: 'All of her, at once, very damply.',
      },
      defensive: {
        name: 'Tide Shell',
        description: 'Draws a shell of seawater up and sits inside it.',
      },
      magic: {
        name: 'Brine Bubble',
        description: 'Blows one enormous salty bubble. It pops on them.',
      },
      mend: {
        name: 'Seafoam Rinse',
        description: 'Wrings herself out over you. It helps, somehow.',
      },
    },
    signature: {
      id: 'stand-on-guard',
      name: 'Stand on Guard',
      description:
        'Looks straight at the thing and does not move. It swings worse for being '
        + 'watched — and she hits harder the worse the fight has already gone.',
      move: 'physical',
      vfx: 'braced-stance',
      modifiers: { accuracyDebuff: 0.2, desperation: { per: 0.05, gain: 0.025 } },
      cooldown: 0,
      oncePerRaid: false,
    },
    support: {
      id: 'soak',
      name: 'Soak',
      description: 'Takes it in. Full of holes, full of seawater, entirely unbothered.',
      move: 'defensive',
      vfx: 'swell',
      modifiers: { shield: 1.35 },
      cooldown: 3,
      oncePerRaid: false,
    },
    passive: {
      id: 'porous',
      name: 'Porous',
      description: 'Notices more than anything that shape has any right to.',
      modifiers: { accuracyDebuff: 0.05 },
    },
  },

  {
    themeId: 'kitty',
    mascot: 'Mochi',
    moves: {
      physical: {
        name: 'Pounce',
        description: 'From stillness to somewhere else entirely.',
      },
      defensive: {
        name: 'Ribbon Knot',
        description: 'Ties the ribbon off. Nothing gets through a good knot.',
      },
      magic: {
        name: 'Lantern Glow',
        description: 'Holds the little lantern up until the dark flinches.',
      },
      mend: {
        name: 'Cat Nap',
        description: 'Four minutes, eyes shut, and back up better.',
      },
    },
    signature: {
      id: 'starry-nights-watch',
      name: "Starry Night's Watch",
      description:
        'Sits up with whoever is still up. Worth more after midnight, and puts a '
        + 'real quarter of the party back on its feet.',
      move: 'mend',
      vfx: 'lantern-vigil',
      modifiers: { healFraction: 0.25, energy: 4 },
      cooldown: 4,
      oncePerRaid: false,
    },
    support: {
      id: 'curl-up',
      name: 'Curl Up',
      description: 'Makes a smaller target of the both of you, deliberately.',
      move: 'defensive',
      vfx: 'ribbon-coil',
      modifiers: { shield: 1.25, energy: 3 },
      cooldown: 2,
      oncePerRaid: false,
    },
    passive: {
      id: 'the-late-hours',
      name: 'The Late Hours',
      description: 'Rest logged after midnight is worth more. She is awake for it either way.',
      modifiers: { healFraction: 0.05, hours: { from: 22, to: 5 } },
    },
  },

  {
    themeId: 'shinobi',
    mascot: 'Foxglove',
    moves: {
      physical: {
        name: 'Ink Claw',
        description: 'Three quick strokes, like a brush that bites.',
      },
      defensive: {
        name: 'Smoke Step',
        description: 'Is not quite where the hit landed.',
      },
      magic: {
        name: 'Foxfire',
        description: 'Pale flame off the tail tip, cold to look at, hot to touch.',
      },
      mend: {
        name: 'Dawn Breath',
        description: "The first breath of the morning's training, shared.",
      },
    },
    signature: {
      id: 'nine-lives',
      name: 'Nine Lives',
      description:
        'Once a raid, and once only. Nothing takes the two of you below one this '
        + 'turn — and the turn after that lands like it means it.',
      move: 'physical',
      vfx: 'ink-flare',
      modifiers: { holdTheLine: true, damage: 1.3 },
      cooldown: 0,
      oncePerRaid: true,
    },
    support: {
      id: 'ink-double',
      name: 'Ink Double',
      description: 'Sends something that looks like her ahead, to find out what is there.',
      move: 'magic',
      vfx: 'ink-split',
      modifiers: { accuracyDebuff: 0.15, combo: 1.2 },
      cooldown: 2,
      oncePerRaid: false,
    },
    passive: {
      id: 'trains-at-dawn',
      name: 'Trains at Dawn',
      description: 'Naps immediately afterwards. The work still counts.',
      modifiers: { damage: 1.06 },
    },
  },
];

const BY_THEME = new Map(COMPANION_KITS.map((kit) => [kit.themeId, kit]));

/** The theme the app falls back to, so the kit falls back with it — the same
 *  id `FALLBACK_MASCOT_ID` uses, and a test holds the two together. */
export const FALLBACK_KIT_ID = 'kitty';

export function kitFor(themeId: string | undefined): CompanionKit {
  return BY_THEME.get(themeId ?? '') ?? BY_THEME.get(FALLBACK_KIT_ID)!;
}

/** Both active skills, in the order a screen should list them. */
export function skillsOf(kit: CompanionKit): CompanionSkill[] {
  return [kit.signature, kit.support];
}

/** The skill this kit hangs off a move, or nothing if it hangs none. */
export function skillForMove(kit: CompanionKit, move: MoveKey): CompanionSkill | undefined {
  return skillsOf(kit).find((skill) => skill.move === move);
}

/** The kit's name for every C# action id, for the move bar and the log line. */
export function moveNamesFor(kit: CompanionKit): Record<string, string> {
  return Object.fromEntries(
    MOVE_KEYS.map((key) => [ACTION_FOR_MOVE[key], kit.moves[key].name]),
  );
}

/* -- firing one ------------------------------------------------------------- */

export interface TurnContext {
  /** Local hour, 0-23. Decides whether an hour-gated skill is awake. */
  hour: number;
  /** Rounds since this skill last fired, or Infinity if it never has. */
  sinceLastUse: number;
  /** Whether a once-per-raid skill has already been spent this raid. */
  spentThisRaid: boolean;
  /** The party's remaining health, as a fraction of its maximum. */
  healthFraction: number;
  /** The element the thing you are fighting is weak to, if it is known yet. */
  weakness?: Element;
}

export type SkillVerdict =
  | { fires: true; skill: CompanionSkill; modifiers: SkillModifiers }
  | { fires: false; reason: string };

/**
 * Whether a companion's skill fires on this turn, and what it is worth.
 *
 * A refusal always carries a reason, the same shape `castBlockedBecause` uses
 * in `skills.ts` — a button that goes quietly dead is the interaction this app
 * is trying not to have.
 *
 * Note what is resolved here and what is not: this answers "does it fire, and
 * with what multipliers". It does not apply them, because the numbers a turn
 * is actually worth live in C# and this module has no business knowing them.
 */
export function fireSkill(
  kit: CompanionKit,
  move: MoveKey,
  context: TurnContext,
): SkillVerdict {
  const skill = skillForMove(kit, move);
  if (!skill) {
    return { fires: false, reason: `${kit.mascot} has nothing extra for ${kit.moves[move].name}.` };
  }

  if (skill.oncePerRaid && context.spentThisRaid) {
    return { fires: false, reason: `${skill.name} is once a raid, and it has been used.` };
  }
  if (context.sinceLastUse < skill.cooldown) {
    const left = skill.cooldown - context.sinceLastUse;
    return { fires: false, reason: `${skill.name} is ready in ${left} ${left === 1 ? 'turn' : 'turns'}.` };
  }

  return { fires: true, skill, modifiers: resolveModifiers(skill.modifiers, context) };
}

/** True when `hour` is inside a window that may wrap past midnight. */
export function withinHours(hour: number, window: { from: number; to: number }): boolean {
  const h = ((hour % 24) + 24) % 24;
  return window.from <= window.to
    ? h >= window.from && h < window.to
    : h >= window.from || h < window.to;
}

/**
 * The modifiers with the conditional ones settled against this turn.
 *
 * Everything unconditional passes through untouched. The three that are not —
 * the hour gate, the element bonus and desperation — are folded into plain
 * numbers here so that the caller applying them never has to ask a question.
 */
export function resolveModifiers(
  modifiers: SkillModifiers,
  context: TurnContext,
): SkillModifiers {
  const out: SkillModifiers = { ...modifiers };

  if (modifiers.hours && !withinHours(context.hour, modifiers.hours)) {
    // Outside its hours the skill still fires — it simply does the ordinary
    // amount. A skill that refused outside its window would punish somebody for
    // resting at the wrong time of day, which is precisely backwards.
    delete out.healFraction;
    delete out.energy;
  }
  delete out.hours;

  if (modifiers.favours) {
    if (context.weakness === modifiers.favours) {
      out.damage = (out.damage ?? 1) * 1.3;
    }
    delete out.favours;
  }

  if (modifiers.desperation) {
    const lost = Math.min(1, Math.max(0, 1 - context.healthFraction));
    const steps = Math.floor(lost / modifiers.desperation.per);
    if (steps > 0) out.damage = (out.damage ?? 1) + steps * modifiers.desperation.gain;
    delete out.desperation;
  }

  return out;
}

/**
 * How hard a kit hits at a given pet level.
 *
 * Skill potency rides the pet's level rather than the companion's rank, because
 * the pet's level is the couple's shared number and a raid is a shared thing.
 * Twenty percent across the whole fifty-level climb: enough to feel, and far
 * short of enough to make a low-level couple's skill not worth pressing.
 */
export const POTENCY_AT_MAX = 1.2;

export function potencyAt(petLevel: number, maxLevel = 50): number {
  const climbed = Math.min(1, Math.max(0, (petLevel - 1) / Math.max(1, maxLevel - 1)));
  return 1 + climbed * (POTENCY_AT_MAX - 1);
}
