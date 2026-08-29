# Notice

## What this is

HeartBeat is a personal, non-commercial gift between two people, published
openly so it can be downloaded and kept. It is not a product, is not sold, and
carries no advertising.

## Trademarks

Five of the app's themes are named after characters and settings owned by other
people:

| Theme | Rights holder |
|---|---|
| Hello Kitty | Sanrio Company, Ltd. |
| SpongeBob | Viacom International Inc. / Paramount |
| Naruto | Masashi Kishimoto / Shueisha, Inc. |
| The Last Airbender | Viacom International Inc. / Nickelodeon |
| My Little Pony | Hasbro, Inc. |

This project is **not affiliated with, endorsed by, sponsored by, or approved
by** any of them. The names are used only as descriptive labels for colour
palettes, in the way someone might say a room is painted "sunflower".

### Collectible pets

The RPG layer has sixteen collectible pets. **None of them is named after, or
drawn from, any character belonging to anyone above.** A character you *collect*
is a stronger claim than a palette label, so the line is drawn well short of it:
the four species are Horse, Fairy, Vampire and **Ribbon Cat**, and the Ribbon
Cat is the repository's own hand-drawn cat mark — the ellipses, bow and
line-segment whiskers already in `gift/src/index.html` and `app/public/icons/` —
named descriptively for what it is. A test in `app/src/domain/rpg/pets.test.ts`
fails if any rights holder's character name appears in a pet name or its lore.

## Artwork

**No third-party artwork is used anywhere in this repository.** There are no
character images, no logos, no wordmarks, no sprites, no fonts belonging to any
rights holder above, and no assets traced or derived from any.

Every graphic is original and generated from code:

- The cat mark in `gift/src/index.html`, `app/public/icons/` and the 3D scene is
  hand-drawn geometry — ellipses, cones and line segments — written by hand.
- Theme backdrops in `app/src/themes/packs/` are procedural canvas animations:
  drifting shapes, gradients and particles, painted at runtime. Nothing is
  loaded from a file.
- The file box, records and heart layout in `gift/src/crate.js`, and the
  turntable in `gift/src/turntable.js`, are built from three.js primitives —
  extruded rounded rectangles, cylinders, capsules and cones. No model file or
  texture is loaded; the only images anywhere in the scene are the photographs.

The photographs in `gift/src/photos/` are personal photographs belonging to the
people in them.

## Third-party code

| Dependency | Licence |
|---|---|
| [three.js](https://threejs.org) (`gift/src/vendor/three.min.js`) | MIT — see `gift/src/vendor/three-LICENSE.txt` |
| [Outfit](https://fonts.google.com/specimen/Outfit) | SIL Open Font License 1.1 |
| [JetBrains Mono](https://www.jetbrains.com/lp/mono/) | SIL Open Font License 1.1 |
| React, Vite, Dexie, Workbox, Wrangler | MIT / Apache-2.0, per each package |

## The cycle page

`app/src/domain/cycle/` is an independent implementation, written from the
published method rather than copied from anyone's source.

Two projects informed it and neither contributed code to it:

| Project | Licence | What was taken |
|---|---|---|
| [Mensinator](https://github.com/EmmaTellblom/Mensinator) | MIT | Nothing directly. It is the origin of the calendar-and-luteal approach used here, by way of lunara. |
| [lunara](https://github.com/djbatalona06/lunara) | AGPL-3.0 | Nothing. It was read for its shape — that `checkInComplete` is worth storing, and that the uncertainty band should be clamped — and those are ideas, not expression. |

This distinction matters and is not a formality. lunara is licensed AGPL-3.0
and is other people's work; HeartBeat is MIT. Copying its engine in would have
made this repository's licence a false statement about its own contents. So the
arithmetic here — a median cycle length, a median absolute deviation for the
spread, a luteal-anchored estimate where there is ovulation evidence, and a
fertile window five days before ovulation to one day after — was written from
the method, which is standard and not anyone's property. The symptom and mood
vocabularies are ordinary clinical terms.

If any of that reads as too fine a line to you, the remedy is the same as
below: open an issue.

Nothing on that page is medical advice, and the fertile window it estimates is
not contraception.

## The song

The song used in the gift is a commercially released recording and is **not**
included in this repository. It is gitignored, the committed `birthday.html` is
built without it, and the version with music is built locally and sent directly.
Nothing here redistributes it.

## If you are a rights holder

Open an issue and the relevant name or asset will be changed promptly.
