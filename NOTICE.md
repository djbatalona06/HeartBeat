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

The song used in the gift is a commercially released recording and is **not**
included in this repository. It is gitignored, the committed `birthday.html` is
built without it, and the version with music is built locally and sent directly.
Nothing here redistributes it.

## If you are a rights holder

Open an issue and the relevant name or asset will be changed promptly.
