import { ISLAND_SPRITES, ISLAND_SPRITE_ORDER } from './monsterSprites';

/**
 * Every pixel in the overworld, as text.
 *
 * There is no PNG anywhere in this feature, and that is a decision with four
 * separate payoffs rather than a purity exercise.
 *
 * **`NOTICE.md` stays true without an edit.** Its central claim is "Every graphic
 * is original and generated from code", and the reason that claim is worth
 * anything is that a reader can check it. A binary blob is unreviewable in a
 * diff; sixteen rows of characters are not.
 *
 * **Themes and dyes reach the sprites for free.** `bake.ts` resolves the same
 * three CSS custom properties every mascot in `features/pet/mascots/` paints in,
 * so a dye bought in the shop recolours the bird walking in the garden and the
 * five theme packs keep working. That is exactly the property `dyes.ts` argues
 * for — "the five drawings never learn that dyes exist" — extended here at no
 * plumbing cost. A spritesheet would have forfeited it entirely.
 *
 * **Nothing can enter the service-worker precache.** `vite.config.ts` globs
 * every PNG in the build, so a spritesheet would need its own ignore entry to
 * stay out of the 882 KB install budget. No file, no exception.
 *
 * **A missing sprite fails CI.** The data is TypeScript, so `sprites.test.ts`
 * pins what `art.test.ts` pins for the SVGs: every sprite is sixteen rows of
 * sixteen known characters, and every key `zones.ts` and `enemies.ts` reference
 * exists. The alternative is a green box at runtime.
 *
 * The cost is that pixels are placed by hand rather than painted. At 16x16 that
 * is how pixel art is made anyway.
 */

/** Every sprite is square, and this is the side. Matches `zones.TILE`. */
export const SPRITE_SIZE = 16;

/**
 * What each character means.
 *
 * `.` is transparent so the theme backdrop shows through; the other four are
 * resolved from CSS custom properties at bake time, which is why they are named
 * for their role rather than for a colour.
 */
export const PALETTE = {
  '.': 'transparent',
  o: 'outline',
  m: 'mid',
  l: 'light',
  a: 'accent',
} as const;

export type PaletteKey = keyof typeof PALETTE;

export const PALETTE_KEYS = Object.keys(PALETTE) as PaletteKey[];

/** Sixteen rows of sixteen `PALETTE` characters. */
export type Sprite = readonly string[];

export const SPRITES: Record<string, Sprite> = {
  // --- tiles. Index order in `zones.TILE_KINDS` keys off these. ---
  'tile-grass': [
    'mmmmmmmmmmmmmmmm',
    'mmmmmmmlmmmmmmmm',
    'mmmmmmmmmmmmmmmm',
    'mmlmmmmmmmmmmmlm',
    'mmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmlmmmm',
    'mmmmmmlmmmmmmmmm',
    'mmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmm',
    'mmmmlmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmlmm',
    'mmmmmmmmmlmmmmmm',
    'mmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmm',
  ],
  'tile-path': [
    'llllllllllllllll',
    'llllllllllllllll',
    'llllllllllmlllll',
    'llllllllllllllll',
    'lllmllllllllllll',
    'llllllllllllllll',
    'llllllllllllllll',
    'llllllllllllllll',
    'lllllllllllllmll',
    'lmllllllllllllll',
    'llllllllllllllll',
    'llllllmlllllllll',
    'llllllllllllllll',
    'llllllllllllllll',
    'llllllllllllllll',
    'llllllllllllllll',
  ],
  'tile-hedge': [
    'oooooooooooooooo',
    'omoomoomoomoomoo',
    'ooooaooooooooooo',
    'oooooooooooooooo',
    'omoomoomoomoomoo',
    'oooooooooaoooooo',
    'oooooooooooooooo',
    'omoomoomoomoomoo',
    'oooooooooooooooo',
    'oooooooooooooaoo',
    'omoomoomoomoomoo',
    'oooooooooooooooo',
    'ooaooooooooooooo',
    'omoomoomoomoomoo',
    'oooooooooooooooo',
    'oooooooooooooooo',
  ],
  // A still pool: 'm' body, short 'l' ripple crests, two sparse 'a' glints.
  // Used to be full-width bands of solid 'a' with thin 'l' seams — thirteen
  // of sixteen rows pure accent, which read as a barcode regardless of what
  // the palette resolved 'l' to. Accent still marks the glint here; it just
  // no longer owns the tile. See `sprites.test.ts` for the ratio this pins.
  'tile-water': [
    'mmmmmmmmmmmmmmmm',
    'mmmmmlllmmmmmmmm',
    'mmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmm',
    'mmmmmmmmmmlllmmm',
    'mmmmmmmmmmmmmmmm',
    'lllmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmm',
    'mmmmmmmmammmmmmm',
    'mmmmmmmmmmmmmmmm',
    'mmmmlllmmmmmmmmm',
    'mmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmlllm',
    'mmmmmmmmmmmmmmmm',
    'mmmammmmmmmmmmmm',
    'mmmmmmmmmmmmmmmm',
  ],
  'tile-bed': [
    'mmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmm',
    'mmmaammmmmmmmmmm',
    'mmmaammmmmmmmmmm',
    'mmmmmmmmmmaammmm',
    'mmmmmmmmmmaammmm',
    'mmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmm',
    'mmmmmmaammmmmmmm',
    'mmmmmmaammmmmmmm',
    'mmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmm',
  ],
  'tile-stone': [
    'mmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmm',
    'mmllllllllllllmm',
    'mmllllllllllllmm',
    'mmlloooooooollmm',
    'mmlloooooooollmm',
    'mmlloooooooollmm',
    'mmlloooooooollmm',
    'mmlloooooooollmm',
    'mmlloooooooollmm',
    'mmlloooooooollmm',
    'mmlloooooooollmm',
    'mmllllllllllllmm',
    'mmllllllllllllmm',
    'mmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmm',
  ],
  'tile-gate': [
    'loollllllllllool',
    'oooooooooooooooo',
    'oooooooooooooooo',
    'loollllllllllool',
    'loollllllllllool',
    'loollllllllllool',
    'loollllllllllool',
    'loollllllllllool',
    'loollllllllllool',
    'loollllllllllool',
    'loollllllllllool',
    'loollllllllllool',
    'loollllllllllool',
    'loollllllllllool',
    'loollllllllllool',
    'loollllllllllool',
  ],

  // --- the bird, one frame per facing ---
  'bird-down': [
    '................',
    '................',
    '................',
    '................',
    '.....oooooo.....',
    '.....oolloo.....',
    '.....oooooo.....',
    '....oooaaooo....',
    '....ommmmmmo....',
    '....omllllmooo..',
    '....omllllmooo..',
    '....ommmmmmo....',
    '....oooooooo....',
    '......a..a......',
    '......a..a......',
    '................',
  ],
  'bird-up': [
    '................',
    '................',
    '................',
    '.......aa.......',
    '.....oooooo.....',
    '.....oolloo.....',
    '.....oooooo.....',
    '....oooooooo....',
    '....ommmmmmo....',
    '..ooomllllmo....',
    '..ooomllllmo....',
    '....ommmmmmo....',
    '....oooooooo....',
    '......a..a......',
    '......a..a......',
    '................',
  ],
  'bird-left': [
    '................',
    '................',
    '................',
    '................',
    '.....oooooo.....',
    '...aaolollo.....',
    '...a.oooooo.....',
    '....oooooooo....',
    '....ommmmmmo....',
    '....omllllmooo..',
    '....omllllmooo..',
    '....ommmmmmo....',
    '....oooooooo....',
    '......a..a......',
    '......a..a......',
    '................',
  ],
  'bird-right': [
    '................',
    '................',
    '................',
    '................',
    '.....oooooo.....',
    '.....ololloaa...',
    '.....oooooo.a...',
    '....oooooooo....',
    '....ommmmmmo....',
    '..ooomllllmo....',
    '..ooomllllmo....',
    '....ommmmmmo....',
    '....oooooooo....',
    '......a..a......',
    '......a..a......',
    '................',
  ],

  // --- the five mascots, as they stand in the garden ---
  //
  // One per theme, keyed by `Theme.id` with a `mascot-` prefix, so
  // `spriteForTheme` is a string concatenation rather than a second table that
  // can fall out of step with the roster. The player's sprite used to be
  // `bird-right` whoever you had chosen at the gate, which made the Raid Gate
  // a menu that changed nothing you could see.
  //
  // Drawn as silhouettes rather than as detail: sixteen pixels of fox has room
  // for ears, a snout and a tail and for nothing else, and the four that read
  // at arm's length are exactly those.
  'mascot-pony': [
    '................',
    '.............a..',
    '............a...',
    '...........aa...',
    '......ooo..oo...',
    '.....ollloooo...',
    '....ollllllllo..',
    '....ollllllllo..',
    '...ommmmmmmmo...',
    '..ommmmmmmmo....',
    '..omllllllmo....',
    '..ommmmmmmmo....',
    '...oooooooooo...',
    '....o..o.o..o...',
    '....o..o.o..o...',
    '................',
  ],
  'mascot-avatar': [
    '................',
    '................',
    '...........oooo.',
    '..........ollllo',
    '..........olaalo',
    '.........ollllo.',
    '....oooooollo...',
    '...ommmmmmmo....',
    '..ommllllmmo....',
    '..ommmmmmmo.....',
    '...ommmmmo......',
    '..oommmmmoo.....',
    '.olllooooollo...',
    '.ollo.....ollo..',
    '..oo.......oo...',
    '................',
  ],
  'mascot-sponge': [
    '................',
    '................',
    '...oooooooooo...',
    '..ollllllllllo..',
    '..ollaollolllo..',
    '..ollllllllllo..',
    '..olloollllolo..',
    '..ollllllllllo..',
    '..ollollolallo..',
    '..ollllllllllo..',
    '..ollolllloolo..',
    '..ollllllllllo..',
    '...oooooooooo...',
    '....o.o..o.o....',
    '....o.o..o.o....',
    '................',
  ],
  'mascot-kitty': [
    '................',
    '................',
    '....oo......oo..',
    '...ollo....ollo.',
    '...olllooooollo.',
    '..aollllllllllo.',
    '.aaolaollolallo.',
    '..aollllllllllo.',
    '...ollloollollo.',
    '...ommmmmmmmmo..',
    '..ommmlllllmmo..',
    '..ommmmmmmmmmo..',
    '...ooooooooooo..',
    '....o.oo.oo.o...',
    '....o.oo.oo.o...',
    '................',
  ],
  'mascot-shinobi': [
    '................',
    '.....o.......o..',
    '....olo.....olo.',
    '....ollo...ollo.',
    '....ollloooollo.',
    '...ollalllallo..',
    '...ollllllllllo.',
    '...olllloollllo.',
    '....ollllllllo..',
    '..ooommmmmmmo...',
    '.omlommmmmmmo...',
    '.omlommmmmmmo...',
    '.omlooooooooo...',
    '..ooo.o.o.o.o...',
    '......o.o.o.o...',
    '................',
  ],

  // --- the three in the garden ---
  'foe-snail': [
    '................',
    '................',
    '................',
    '................',
    '................',
    '....oooooooo.a..',
    '....oaaaaaao.a..',
    '....oallllaooo..',
    '....oaloolaooo..',
    '....oallllaooo..',
    '....oaaaaaaooo..',
    '..mmoooooooomm..',
    '..mllllllllllm..',
    '..mmmmmmmmmmmm..',
    '................',
    '................',
  ],
  'foe-magpie': [
    '................',
    '................',
    '................',
    '.....oooooo.....',
    '..aa.oolooo.....',
    '.....oooooo.....',
    '.....oooooo.....',
    '....oooooooo....',
    '....oolllllo....',
    '....oolllllo....',
    '....oolllllo....',
    '....ooooooooooo.',
    '......a..a.ommo.',
    '......a..a.ommo.',
    '...........oooo.',
    '................',
  ],
  'foe-wasp': [
    '................',
    '................',
    '................',
    '................',
    '.....oooooo.....',
    '.....oaoaao.....',
    '.lllloaaaaollll.',
    '.lllloooooollll.',
    '.llllaaaaaallll.',
    '.....oooooo.....',
    '.....aaaaaa.....',
    '.....oooooo.....',
    '.....aaaaaa.....',
    '.....oooooo.....',
    '.......oo.......',
    '................',
  ],

  // --- Eve's Garden, island 1: Morning Meadow. ---
  //
  // The keys mirror `SpriteKey` on each monster in
  // `game/HeartBeat.Game.Core/Data/Island1.cs`, which is the one string the two
  // languages have to agree on. Nothing checks that agreement at compile time —
  // C# does not import this file and this file does not import C# — so
  // `sprites.test.ts` restates the seven keys and fails if one goes missing,
  // and `IslandTests.EveryMonsterHasASpriteAndAtLeastOneAction` guards the
  // other end.
  //
  // Drawn as four friendly elemental spirits, Earth, Water, Fire and Air, and
  // as silhouettes that get heavier down the island: the stage-1 Mossling is
  // small and open, the stage-7 boss fills the frame. A player who cannot read
  // a stat block can still read that. The elements are the spirits' look only;
  // the fight's type chart is `Element` in C# and is untouched by them.

  // Stage 1, Earth: the Mossling. A pebble with a sprout curling off
  // the top and its eyes open. The smallest silhouette on the island, so the
  // first thing a new couple fights reads as something they can beat.
  'sloth-sprout': [
    '................',
    '................',
    '.......oo.......',
    '......ollo......',
    '.....olloo......',
    '......oo.oo.....',
    '.......oolo.....',
    '.....oooooo.....',
    '....ommmmmmo....',
    '...omlmmmmmmo...',
    '...omommmmomo...',
    '...ommmmmmmmo...',
    '...ommmaammmo...',
    '....ommmmmmo....',
    '.....oooooo.....',
    '................',
  ],
  // Stage 2, Water: the Dewdrop. A single fat drop, wider than the
  // Mossling and closed all the way round, which is what `Shell Up` looks
  // like when it lands.
  'dozing-beetle': [
    '................',
    '.......oo.......',
    '......olmo......',
    '......olmo......',
    '.....olmmmo.....',
    '....olmmmmmo....',
    '...olmmmmmmmo...',
    '..olmmmmmmmmmo..',
    '..olmommmmommo..',
    '..olmmmmmmmmmo..',
    '..ommmmaammmmo..',
    '..ommmmmmmmmmo..',
    '...ommmmmmmmo...',
    '....oommmmoo....',
    '......oooo......',
    '................',
  ],
  // Stage 3, Fire: the Cinder Sprite. The first spirit drawn upward
  // rather than outward, three flame tongues above a round glow, because it
  // is the first that can out-speed the player.
  'snooze-thistle': [
    '.......oo.......',
    '......oaao......',
    '..o...oaao...o..',
    '.oao.oaaaao.oao.',
    '.oaaooallaooaao.',
    '.oaaaallllaaaao.',
    '.oaallllllllaao.',
    '..oalollllolao..',
    '..oallllllllao..',
    '..ollllllllllo..',
    '...olllaalllo...',
    '....ollllllo....',
    '.....oolloo.....',
    '......oooo......',
    '................',
    '................',
  ],
  // Stage 4, the semi-boss, Water: the Long Drizzle. A raincloud
  // filling the frame edge to edge with its rain hanging underneath. It is
  // the only Island 1 sprite that touches both side walls, which is the whole
  // read: you cannot go round it.
  'lie-in': [
    '................',
    '....ooo..oooo...',
    '...olllooolllo..',
    '..olllllllllllo.',
    '.ollllllllllllo.',
    'ollllllllllllllo',
    'ollloolllloolllo',
    'ollllllllllllllo',
    'ollllllaallllllo',
    'ollllllllllllllo',
    '.oommmmmmmmmmoo.',
    '...oooooooooo...',
    '..o...o...o...o.',
    '.omo.omo.omo.omo',
    '..o...o...o...o.',
    '................',
  ],
  // Stage 5, the breather, Air: the Breeze Wisp. Deliberately the
  // least solid thing here, loose curls of wind with gaps straight through,
  // so the recovery stage looks like one before the first turn is taken.
  'dust-drifter': [
    '................',
    '....oooooo......',
    '...o......o.....',
    '..o..oooo..o....',
    '..o.o....o.o..o.',
    '..o.o.lo.o.o.olo',
    '..o.o.aa...o..o.',
    '..o..o....o.....',
    '...o..oooo....o.',
    '....o........olo',
    '.....oooooooo.o.',
    '..o.............',
    '.olo.....ooooo..',
    '..o.....o.......',
    '.........ooooo..',
    '................',
  ],
  // Stage 6, the elite, Earth: the Mossback Golem. The Mossling grown
  // up, a boulder torso with moss across the shoulders, standing on two
  // stubs.
  'couch-moss': [
    '...oo.oooo.oo...',
    '.olloolllloollo.',
    '.ollllllllllllo.',
    '.ommmmmmmmmmmmo.',
    'oommaammmmaammoo',
    'ommmmmmmmmmmmmmo',
    'ommmmmoooommmmmo',
    'ommlmmmmmmmmlmmo',
    'ommmmmmmmmmmmmmo',
    'oommmmmllmmmmmoo',
    '.ommmmmmmmmmmmo.',
    '.ommmmoooommmmo.',
    '..ommo....ommo..',
    '..ommo....ommo..',
    '..oooo....oooo..',
    '................',
  ],
  // Stage 7, the boss, Fire: the Hearthkeeper. Armoured, symmetrical,
  // crowned in flame, and the only sprite with a lit hearth across its
  // middle. It fills the frame top to bottom where the Drizzle only filled it
  // side to side.
  'sedentary-sentinel': [
    '..o....oo....o..',
    '.oao..oaao..oao.',
    '.oaaooaaaaooaao.',
    '..ooollllllooo..',
    '.ollommmmmmollo.',
    'ollommoaaommollo',
    'ollommmmmmmmollo',
    'ollloooooooolllo',
    'ollomoooooomollo',
    'olmmoaaaaaaommlo',
    'olmmoallllaommlo',
    'olmmoaaaaaaommlo',
    'ollloooooooolllo',
    '.ollllllllllllo.',
    '.oollo....olloo.',
    '..oooo....oooo..',
  ],

  // --- islands 2 to 7, from their own file. ---
  ...ISLAND_SPRITES,
};

/**
 * Eve's Garden's monster sprites, island 1.
 *
 * Exported because this list is referenced from two places that cannot see each
 * other. `BattleGardenScene` bakes exactly these, and `sprites.test.ts` holds
 * them against the keys authored as `SpriteKey` in
 * `game/HeartBeat.Game.Core/Data/Island1.cs` — a boundary TypeScript cannot
 * typecheck across, so a restated list plus a test is the whole of the
 * enforcement, exactly as with `HOLDING_KINDS` and the endpoint's `KINDS`.
 *
 * In island order, which is also the order they get heavier.
 */
export const ISLAND_1_SPRITE_KEYS = [
  'sloth-sprout', 'dozing-beetle', 'snooze-thistle', 'lie-in',
  'dust-drifter', 'couch-moss', 'sedentary-sentinel',
] as const;

/**
 * Every island's monster sprites, in stage order: island 1's from above and
 * the rest from `monsterSprites.ts`. `sprites.test.ts` holds each list against
 * the `SpriteKey`s authored in the matching `Data/Island<N>.cs`.
 */
export const ISLAND_SPRITE_KEYS: Record<number, readonly string[]> = {
  1: ISLAND_1_SPRITE_KEYS,
  ...ISLAND_SPRITE_ORDER,
};

const KEYS = new Set(Object.keys(SPRITES));

/** Total: an unknown key is `undefined` rather than a throw or a green box. */
export function spriteFor(key: string): Sprite | undefined {
  return SPRITES[key];
}

/**
 * The sprite a theme's mascot walks in. Falls back the same way `getMascot`
 * does, so a theme id left in storage by an older build still gets a body
 * rather than an empty tile.
 */
export const FALLBACK_MASCOT_SPRITE = 'mascot-kitty';

export function spriteKeyForTheme(themeId: string | undefined): string {
  const key = `mascot-${themeId ?? ''}`;
  return hasSprite(key) ? key : FALLBACK_MASCOT_SPRITE;
}

export function hasSprite(key: string): boolean {
  return KEYS.has(key);
}
