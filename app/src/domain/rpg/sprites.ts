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
};

const KEYS = new Set(Object.keys(SPRITES));

/** Total: an unknown key is `undefined` rather than a throw or a green box. */
export function spriteFor(key: string): Sprite | undefined {
  return SPRITES[key];
}

export function hasSprite(key: string): boolean {
  return KEYS.has(key);
}
