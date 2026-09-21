import { describe, expect, it } from 'vitest';
import { THEMES } from './index';
import {
  MOOD_DIM_STRENGTH, MOOD_WARM_STRENGTH, accentForMood, contrast, darkVariantOf,
  mixHex, themeToCssVars,
} from './tokens';
import type { ThemeMode, ThemeVariant } from './types';
import { DEFAULT_MOOD, type PetMood } from '../domain/pet/mood';

/**
 * The accent leans with the pet's mood, and a leaned accent is an unproven one.
 *
 * `tokens.test.ts` shows that `accentText` clears AA on `accent` for all ten
 * palettes. That proof stops being worth anything the moment the accent is no
 * longer the colour the pack wrote down — which is exactly what
 * `--color-accent-live` does. So the same question is asked again, of every
 * colour the mood can actually produce: five packs, two palettes, three moods.
 *
 * This is the reason the mood is a bounded lean rather than the hue rotation
 * the feature was first sketched as. A hue is a colour nobody checked; a mix
 * between two colours in the same palette is one this file can walk.
 */

const MOODS: PetMood[] = ['happy', 'content', 'sleepy'];

/** The AA floor for body-sized text, which is what a `.primary` label is. */
const AA = 4.5;

/**
 * How much of the accent's own separation from the page a lean may spend.
 *
 * Not an absolute floor, because there is no absolute floor to hold it to: the
 * packs' accents sit between 1.71:1 and 2.53:1 against `base` in light mode
 * *before* any of this existed, and that is fine — `.home-pet-fill` and
 * `.bar-fill-accent` sit on a card, not on the page ground, so accent-against-
 * base was never the pair anybody designed to. Asserting 3:1 here would be
 * failing the build over a choice five packs made years before the mood did.
 *
 * What this feature *is* answerable for is not eroding what the pack chose. So
 * the question is relative: the sleepy lean is toward the ground, and this is
 * what stops "receding" turning into "gone". At the shipped strengths the
 * worst case is sponge's dark palette keeping 0.739 of its separation, so 0.70
 * is a real tripwire rather than a rubber stamp — drop `MOOD_DIM_STRENGTH` to
 * 80 and this fails, which is the point.
 */
const MIN_SEPARATION_KEPT = 0.7;

describe('the accent leans without going unreadable', () => {
  for (const theme of THEMES) {
    const variants: { mode: ThemeMode; variant: ThemeVariant }[] = [
      { mode: 'dark', variant: darkVariantOf(theme) },
      { mode: 'light', variant: theme.light },
    ];

    for (const { mode, variant } of variants) {
      for (const mood of MOODS) {
        describe(`${theme.name} (${mode}, ${mood})`, () => {
          it('keeps the button label legible on the leaned fill', () => {
            // `.primary` paints `--color-accent-live` and keeps
            // `--color-accent-text` on top of it. If this fails, a button is
            // readable in the afternoon and not at 3am.
            const accent = accentForMood(variant, mood);
            expect(contrast(variant.colors.accentText, accent)).toBeGreaterThanOrEqual(AA);
          });

          it('keeps most of the separation the pack already had', () => {
            // `.home-pet-fill` and `.bar-fill-accent` are shapes rather than
            // text. They are measured against what the untouched accent
            // already managed, not against a fixed bar — see the note on
            // MIN_SEPARATION_KEPT for why an absolute floor would be wrong.
            const before = contrast(variant.colors.accent, variant.colors.base);
            const after = contrast(accentForMood(variant, mood), variant.colors.base);
            expect(after / before).toBeGreaterThanOrEqual(MIN_SEPARATION_KEPT);
          });
        });
      }
    }
  }
});

describe('the lean itself', () => {
  it('leaves the resting mood as the pack wrote it', () => {
    // A mood layer whose neutral is not the original is a permanent tint
    // wearing a mood's name. `content` is what the pet is most of the time.
    for (const theme of THEMES) {
      expect(accentForMood(darkVariantOf(theme), DEFAULT_MOOD)).toBe(theme.colors.accent);
      expect(accentForMood(theme.light, DEFAULT_MOOD)).toBe(theme.light.colors.accent);
    }
  });

  it('actually moves the accent for the two moods that are not resting', () => {
    // The counterpart to the check above: a strength of 100 would satisfy
    // every contrast assertion here and ship a feature that does nothing.
    for (const theme of THEMES) {
      for (const variant of [darkVariantOf(theme), theme.light]) {
        expect(accentForMood(variant, 'happy')).not.toBe(variant.colors.accent);
        expect(accentForMood(variant, 'sleepy')).not.toBe(variant.colors.accent);
      }
    }
  });

  it('emits the strengths the stylesheet mixes with', () => {
    // The stylesheet spells the mix in CSS so it re-resolves on a theme change
    // without JavaScript. That only stays honest while both sides read one
    // number — these two tokens are that number.
    const vars = themeToCssVars(THEMES[0], 'dark');
    expect(vars['--mood-warm']).toBe(`${MOOD_WARM_STRENGTH}%`);
    expect(vars['--mood-dim']).toBe(`${MOOD_DIM_STRENGTH}%`);
  });
});

describe('mixHex matches color-mix(in srgb, …)', () => {
  it('returns each pole at the extremes', () => {
    expect(mixHex('#102030', '#a0b0c0', 100)).toBe('#102030');
    expect(mixHex('#102030', '#a0b0c0', 0)).toBe('#a0b0c0');
  });

  it('interpolates the gamma-encoded bytes, not the linearised ones', () => {
    // `in srgb` is the gamma-encoded space, so the midpoint of 0x00 and 0xff
    // is 0x80 — not the 0xbc a linear-light mix would give. Getting this wrong
    // would make every assertion above measure a colour nobody paints.
    expect(mixHex('#000102', '#fefdff', 50)).toBe('#7f7f81');
  });

  it('refuses a colour it cannot mix', () => {
    // The dim pole is the page ground rather than `surfaceMuted` precisely
    // because `surfaceMuted` is `rgba()` in all five packs. This is what would
    // fail loudly if somebody swapped the pole back.
    expect(() => mixHex('rgba(0, 70, 116, 0.7)', '#102030', 50)).toThrow();
  });
});
