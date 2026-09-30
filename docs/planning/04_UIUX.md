# 04 · UI/UX Design Brief

Keep Heartbeat's look: five theme packs × light/dark, each with its own mascot and
accent. **Do not introduce new colours outside the theme tokens.** New effect
palettes must be derived from each pack's tokens so the packs stay distinct
(`docs/design-system.md`, `docs/PULSE.md`).

## The five companions

| Theme id | Companion | Signature skill (vfx) | Support skill (vfx) | Existing shape |
|---|---|---|---|---|
| `pony` | Wishbell | Star Missile (`horn-bolt`) | One Wish Spare (`held-spark`) | bolt / motes |
| `avatar` | Cirrus | `ring-of-wind` | `rising-current` | ring / motes |
| `sponge` | Marigold | `braced-stance` | Swell (`swell`) | shield / ring |
| `kitty` | Mochi | `lantern-vigil` | `ribbon-coil` | motes / ring |
| `shinobi` | Foxglove | `ink-flare` | `ink-split` | burst / bolt |

(Only Wishbell's skill names were read in full; the other names above are vfx keys.
Read `companionSkills.ts` before writing copy.)

## The 15 effects (Phase C) — hybrid art

Existing motions (`scene/vfx.ts`): `bolt` (travels the gap), `ring` (opens around),
`shield` (held in front), `motes` (rises), `burst` (bloom at a point).
Named for the *motion*; **colour, count and timing carry whose it is**.

| Move | What it should read as | Default motion | Variation per companion |
|---|---|---|---|
| Physical | something crosses the gap and lands | `bolt` | shape of the projectile (hoof-stamp / wind streak / splash / paw / ink stroke), speed, trail |
| Defensive | something held in front of you | `shield` | arc width, colour, how it dissolves |
| Magic | something opens or blooms | `ring` / `burst` | particle count, palette, sparkle vs smoke vs bubbles |

Each of the five fills the 3 × 3 grid of (shape, palette token, count, timing);
no two companions share a palette-and-motion pair for the same move. **Hybrid:**
add one bespoke signature piece per companion (their signature skill's landing),
drawn from Phaser primitives or a small lazy sprite — decision open in
`00_HANDOFF.md`.

**Originality:** characters are the five originals in `features/pet/mascots/`.
No rights-holder names, marks or recognisable likenesses anywhere; the existing
guard tests enforce it for the kit files — extend them to any new art file.

## Accessibility rules (required)

- **Colour is never the only signal.** Every effect also has a log line naming the
  move and effect, and a live-region announcement (`aria-live="polite"`, the
  pattern `BattleLog.tsx` already uses).
- **Contrast:** every new palette must clear AA in both modes against the scene
  and the scrim; extend the `mood.test.ts`-style proof to 5 packs × 2 modes × the
  new tokens. Verify the dim/secondary text specifically.
- **Reduced motion / calm:** zero tweens, zero added delay; information unchanged.
  Flashing: no more than 3 flashes per second (WCAG 2.3.1) — the hurt flash is a
  single bright-and-return; keep it that way.
- **Keyboard:** every move reachable without a mouse (the action bar buttons and
  the labelled `DirectionPad` already are; verify the Raid Gate and map).
- **Screen reader:** fight state, results and the level-up reveal are announced;
  decorative glyphs are `aria-hidden`.
- **Text size:** not found in settings; a user font-size control is a candidate
  (Phase F) and must not break the fight layout at 200% zoom.
- **Touch targets:** at least 24 × 24 px (WCAG 2.2 AA), larger for the move bar.

## Level-up reveal (Phase E)

One line on Home under the `Lv N` bar: `<milestone.name> — <milestone.blurb>`, from
`MILESTONES`, using `MILESTONE_KIND_NAMES` for the category. Tone: short, concrete,
never "well done" — the file's own rule is that a level that only says so is a
notification. Calm shows the same text without motion.

## Wellness framing (Phase D)

Copy and ordering, not a new system: person-first verbs ("you moved", "you rested")
before pet verbs. A single "today" ring is an **open question**; the charges it
would show already exist (`domain/rpg/charges.ts`; `ChargeMeter` in the garden;
`rested` / `grateful` / `ateWell` flags on `MoodEntry`). The garden has no logging
controls and must not gain any.
