import type { Sprite } from './sprites';

/**
 * The five finishing moves' own 16x16 pictures, one per companion.
 *
 * Kept apart from `sprites.ts` only for length: `SPRITES` spreads this in, so
 * the garden's scene bakes them with everything else (in the pack's own colours
 * and any dye) and the move pad draws the same grid on its button. The key is
 * `ult-<theme id>`, which is what `companionSkills.ts` names on each kit.
 *
 * Drawn with a small rasteriser and pasted here as text, like every other
 * sprite: a reader can check it in a diff.
 */
export const ULTIMATE_SPRITES: Record<string, Sprite> = {
  // Wishbell: a wish comet, a star with a tail.
  'ult-pony': [
    '.........oo.....',
    '.........oo.....',
    '.........oo.....',
    '.......oolmoo...',
    '....ooolmaammooo',
    '.....olmaaaammo.',
    '.....ommaaaamo..',
    '....olmmmaamo...',
    '....ommmmoomo...',
    '...olmmmo..omo..',
    '...ommmmmo..oo..',
    '..olmmmooo......',
    '..ommoo.........',
    '.oloo...........',
    '.oo.............',
    'o...............',
  ],
  // Cirrus: a thunderhead with its bolt.
  'ult-avatar': [
    '.........o......',
    '.......ooloo....',
    '...oooolmmmmo...',
    '..olmmmmmmmmmo..',
    '..ommmmmmmmmmmo.',
    '..ommmmmmmmmmmo.',
    '..ommmmmmmmmmmo.',
    '..ommmmmmmmmmmo.',
    '..oooooommooooo.',
    '........oo......',
    '.......oaaoo....',
    '......oaaao.....',
    '.....ooaoo......',
    '.......o........',
    '......o.........',
    '................',
  ],
  // Marigold: a wave curling over.
  'ult-sponge': [
    '................',
    '................',
    '......ooooo.....',
    '....oolmmmmoo...',
    '...olmmmmmmaao..',
    '...ommmmooooamo.',
    '..olmmmo....ooo.',
    '..ommmo.......o.',
    '..ommo........oo',
    '..ommo.........o',
    '..ommo..........',
    '..ommo..........',
    '...ommo.......o.',
    'oooaaaaooo......',
    'oaaaaaaaao..o...',
    'ooooooooooo.....',
  ],
  // Mochi: the night-watch moon and one star.
  'ult-kitty': [
    '................',
    '.....oo.........',
    '...ooo..........',
    '..olo...........',
    '.olmo...........',
    'olmmo...........',
    'ommmo...........',
    'ommmo...........',
    'ommmo.......o...',
    'ommmmo......o...',
    'ommmmmo..oooaooo',
    '.ommmmmoo.oaao..',
    '..ommmmmmolmoo..',
    '...oommmmooo.o..',
    '.....oooo.......',
    '................',
  ],
  // Foxglove: one tall foxfire flame.
  'ult-shinobi': [
    '................',
    '.......oo.......',
    '.......olo......',
    '......olmo......',
    '......ommmo.....',
    '.....olmmmmo....',
    '...oolmmmmmmo...',
    '..olmmmmmmmmmo..',
    '..ommmmaammmmo..',
    '..ommmaaaammmo..',
    '..ommaaaaaammo..',
    '..ommaaaaaammo..',
    '..ommaaaaaammo..',
    '...ommaaaammo...',
    '....oooooooo....',
    '................',
  ],
};
