/**
 * How a monster fights, as the screen needs to say it.
 *
 * The rules themselves are in C# (`game/.../Behaviours.cs`), because that is
 * where a move is chosen and priced. This is the small amount the screen has to
 * know without asking: what to call each playstyle, what a warning says, and how
 * many blows a warned move lands so the scene can play that many.
 *
 * `behaviours.test.ts` reads the C# enum and fails when the two lists drift, the
 * same arrangement `islands.test.ts` has for the islands.
 */

/** Matches the C# `Behavior` enum. */
export const MONSTER_BEHAVIORS = [
  'Steady', 'Bruiser', 'Swarm', 'Guardian', 'Drainer', 'Trickster', 'Healer',
] as const;
export type MonsterBehavior = (typeof MONSTER_BEHAVIORS)[number];

/** What the game core warns of one turn ahead. Matches `Behaviours.Telegraph`. */
export const TELEGRAPHS = ['heavy', 'flurry', 'guard', 'drain', 'mend'] as const;
export type Telegraph = (typeof TELEGRAPHS)[number];

/** One line per playstyle, for the monster's card. Steady has none: it is the default. */
export const BEHAVIOR_BLURBS: Record<MonsterBehavior, string> = {
  Steady: '',
  Bruiser: 'Gathers itself, jabs, then swings hard. Watch for the wind-up.',
  Swarm: 'When it attacks it strikes twice, a little lighter each time.',
  Guardian: 'Raises its guard, then answers with two measured blows.',
  Drainer: 'Lays a drain on you, then leans on it.',
  Trickster: 'Hits harder when it lands. Sometimes it does not.',
  Healer: 'Mends itself when it is hurt, and only then.',
};

const WARNINGS: Record<Telegraph, (name: string) => string> = {
  heavy: (name) => `${name} is winding up a heavy blow. A ward now would help.`,
  flurry: (name) => `${name} is about to strike twice.`,
  guard: (name) => `${name} is about to raise its guard.`,
  drain: (name) => `${name} is about to lay a drain on you.`,
  mend: (name) => `${name} is about to mend itself. Hit it now.`,
};

/** The sentence for a warning, or null for none. */
export function telegraphText(name: string, telegraph: string | null | undefined): string | null {
  const kind = normalizeTelegraph(telegraph);
  return kind ? WARNINGS[kind](name) : null;
}

/** A value off the wire, kept only if it is one the game core really sends. */
export function normalizeTelegraph(value: unknown): Telegraph | null {
  return (TELEGRAPHS as readonly unknown[]).includes(value) ? (value as Telegraph) : null;
}

export function behaviorBlurb(behavior: string | null | undefined): string {
  return (MONSTER_BEHAVIORS as readonly unknown[]).includes(behavior)
    ? BEHAVIOR_BLURBS[behavior as MonsterBehavior]
    : '';
}

/** How many separate blows the scene should play for a warned move. */
export function blowsFor(telegraph: string | null | undefined): number {
  return normalizeTelegraph(telegraph) === 'flurry' ? 2 : 1;
}

/**
 * Whether the monster's last line says its attack did not land.
 *
 * The game core words a missed swing "... - it lunges and misses." The scene
 * uses this to leave out the hit it would otherwise draw on you.
 */
export function monsterMissed(log: readonly { who: string; text: string }[]): boolean {
  const last = [...log].reverse().find((line) => line.who === 'Monster');
  return last !== undefined && /\bmisses\b/.test(last.text);
}
