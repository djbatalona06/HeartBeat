import { dyeStyle } from '../../domain/rpg/dyes';

/**
 * The big tree in the right of the garden, and the light coming through it.
 *
 * ## Why it is here at all
 *
 * The garden had a sky, a tree *line* and a floor, and every one of those is a
 * band across the frame. A drawing made only of bands has no single thing in
 * it to look at, so the eye reads the whole viewport as texture and the screen
 * as busy-but-empty. One large object, off centre, with light coming through
 * it, is what turns three bands into a place — the same argument the
 * foreground bank at the bottom of `GardenBackdrop` already makes about depth,
 * one step further.
 *
 * Right of centre, because the middle is where the mascot stands and the pet
 * card sits. This fills the half of the frame that had the pond in it and
 * nothing above the horizon.
 *
 * ## One light source, and one highlight
 *
 * `Mochi.tsx` states the rule: "the light sits above and to the left, and
 * everything below agrees with that. A highlight that disagrees with its own
 * light source is what makes a drawing look plastic." Here the light moves —
 * `sunAt(hour)` walks it across the day — so which side is lit is derived once
 * and every shape reads it.
 *
 * The first version of this gave **each** canopy blob its own highlight, and
 * the result read as a bunch of grapes: nine spheres each with its own
 * specular, rather than one crown. So the lit shape and the shaded shape are
 * now single forms over the whole crown. One light, one highlight.
 *
 * Both of them **hug an edge**. A highlight floating in the middle of a mass
 * reads as a hole in it and a shadow across the middle reads as a band laid on
 * top of it; light lands on the edge nearest the light and shade gathers on
 * the one furthest from it. Two renders were spent learning that, one per
 * shape.
 *
 * The crown is flat overlaid shapes at fractional opacity rather than
 * gradients, which is also Mochi's rule and the reason this repaints on a
 * theme change for free. The light group under it is the one exception and
 * says why: a shaft with a hard edge is a pillar, and the only ways to soften
 * one are a gradient or a filter.
 *
 * ## The pet's colours, and the guard that covers them
 *
 * The **canopy only** takes the couple's dye, so the tree shifts with the bird
 * they chose. The dye group is inside the trunk's, not around it: `dyeStyle`
 * writes `--color-text-muted`, which is what the trunk and the branches are
 * painted with, so wrapping the whole tree in it gave a bright green trunk on
 * the moss dye and a purple one on plum. A dyed trunk reads as a coloured
 * object rather than as a tree.
 *
 * Putting dye colours behind the veil means text sits on top of them, so
 * `themes/veil.test.ts` now composites the dye palette as well as the theme
 * palettes — its own comment names this hazard: "if a new paint appears in the
 * garden that is not on this list, this test keeps passing while the screen
 * gets less legible."
 *
 * ## Nothing here is random
 *
 * Every cluster, leaf and shaft is placed by arithmetic over its index. A
 * `Math.random()` would give a different tree on each render, on each of the
 * two phones, and in each visual-regression screenshot.
 */

export interface GardenTreeProps {
  /** Where the sun is, in viewBox units. From `sunAt(hour)`. */
  sun: { x: number; y: number; night: boolean };
  night: boolean;
  /** 0-1. Warm weeks open the canopy a little; a hard week only cools it. */
  warm: number;
  /** The shared pet's level, which is what fills the canopy out. */
  petLevel: number;
  /** The couple's dye id, or undefined for the default. */
  dye?: string;
}

/** Where the trunk meets the ground, in viewBox units. */
const ROOT_X = 306;
const ROOT_Y = 160;
/** Where light lands. Two units under the root so the pool is not a hairline. */
const GROUND = ROOT_Y + 2;

/**
 * Where the three shafts leave the canopy, as offsets from the trunk.
 *
 * Not symmetric about the trunk, on purpose. Evenly spaced either side of it
 * they read as legs: three near-vertical forms of similar width under one mass
 * is a stool, and no amount of softening fixes a silhouette. Offsets are
 * mirrored by `shade`, so the group always sits on the side the light falls
 * towards rather than the side it comes from.
 */
const SHAFTS: readonly number[] = [-22, -4, 17];

/** How far a shaft's foot travels from its top, over the drop to the ground. */
const LEAN = 13;

/**
 * The crown, as a few large overlapping masses.
 *
 * Six rather than the nine this started with, each bigger and overlapping its
 * neighbours hard, because separable blobs read as fruit. The silhouette these
 * make is the tree; the leaves below only break its edge.
 */
const CLUSTERS: readonly { x: number; y: number; r: number }[] = [
  { x: 306, y: 70, r: 40 },
  { x: 266, y: 88, r: 32 },
  { x: 346, y: 86, r: 33 },
  { x: 292, y: 52, r: 27 },
  { x: 330, y: 56, r: 25 },
  { x: 306, y: 96, r: 34 },
];

/** How many leaves break the silhouette at a full-grown canopy. */
const LEAVES = 34;

export function GardenTree({ sun, night, warm, petLevel, dye }: GardenTreeProps) {
  // Which side the light is on. Derived once so every shape below agrees.
  const litLeft = sun.x < ROOT_X;
  // +1 when the shade falls to the right of a form, -1 when it falls left.
  const shade = litLeft ? 1 : -1;

  // The crown fills out as the pet grows. Capped well below MAX_LEVEL so a
  // couple sees it change early and often rather than once at fifty.
  const fullness = Math.min(1, Math.max(0, petLevel / 24));
  const leafCount = Math.round(LEAVES * (0.5 + fullness * 0.5));
  const grow = 0.86 + fullness * 0.14;

  // The crown's real underside, which is the lowest edge of the lowest
  // cluster rather than a number typed next to the others. The old
  // `CROWN_BASE = 104` was 22 units too high, so every shaft started inside
  // the canopy and painted a bar straight across the leaves.
  const crownFoot = Math.max(...CLUSTERS.map((c) => c.y + c.r * grow * 0.88));

  return (
    <g className="garden-tree">
      {/* -- the trunk, in the theme's own colours ---------------------------- */}
      <path
        d={`M${ROOT_X - 10} ${ROOT_Y}
            C${ROOT_X - 8} ${ROOT_Y - 26} ${ROOT_X - 7} ${ROOT_Y - 42} ${ROOT_X - 5} ${ROOT_Y - 62}
            L${ROOT_X + 5} ${ROOT_Y - 62}
            C${ROOT_X + 7} ${ROOT_Y - 42} ${ROOT_X + 8} ${ROOT_Y - 26} ${ROOT_X + 10} ${ROOT_Y} Z`}
        fill="var(--color-text-muted)"
      />
      {/* The shaded flank: one flat shape, on whichever side the sun is not. */}
      <path
        d={`M${ROOT_X + shade * 4} ${ROOT_Y}
            C${ROOT_X + shade * 3} ${ROOT_Y - 26} ${ROOT_X + shade * 3} ${ROOT_Y - 42} ${ROOT_X + shade * 2} ${ROOT_Y - 62}
            L${ROOT_X + shade * 5} ${ROOT_Y - 62}
            C${ROOT_X + shade * 7} ${ROOT_Y - 42} ${ROOT_X + shade * 8} ${ROOT_Y - 26} ${ROOT_X + shade * 10} ${ROOT_Y} Z`}
        fill="var(--color-base)"
        opacity="0.3"
      />

      {/* -- the branches, reaching up into the crown ------------------------- */}
      <g stroke="var(--color-text-muted)" fill="none" strokeLinecap="round">
        <path d={`M${ROOT_X - 4} ${ROOT_Y - 56} Q${ROOT_X - 26} ${ROOT_Y - 68} ${ROOT_X - 40} ${ROOT_Y - 76}`} strokeWidth="4.5" />
        <path d={`M${ROOT_X + 4} ${ROOT_Y - 58} Q${ROOT_X + 26} ${ROOT_Y - 70} ${ROOT_X + 42} ${ROOT_Y - 78}`} strokeWidth="4.5" />
        <path d={`M${ROOT_X} ${ROOT_Y - 62} L${ROOT_X - 2} ${ROOT_Y - 84}`} strokeWidth="3" />
      </g>

      {/*
        -- the crown ---------------------------------------------------------
        Dyed, and only this. Swayed as one group, rotating about the root
        rather than its own centre, because a tree bends from the ground. The
        motion is CSS -- see `.garden-tree-canopy` in styles.css, which also
        switches it off under calm mode and reduced motion.
      */}
      <g className="garden-tree-canopy" style={dyeStyle(dye)}>
        {/* The mass. One fill, six overlapping forms, no per-blob highlight. */}
        <g fill="var(--color-surface)">
          {CLUSTERS.map((c) => (
            <ellipse
              key={`${c.x}-${c.y}`}
              cx={c.x}
              cy={c.y}
              rx={c.r * grow}
              ry={c.r * grow * 0.88}
            />
          ))}
        </g>

        {/*
          The leaves that break the silhouette. Without them the crown is six
          smooth arcs, which is what makes a blob canopy read as a cloud.
          Each sits on the crown's outer edge -- derived from the cluster it
          belongs to rather than from a circle around the trunk, which is what
          scattered the first version's leaves outside the tree like confetti.
        */}
        {Array.from({ length: leafCount }, (_, i) => {
          const c = CLUSTERS[i % CLUSTERS.length]!;
          // Walk the edge of each cluster in turn. The 2.39 step is close to a
          // golden angle, so successive leaves on one cluster land apart.
          const angle = i * 2.39;
          const r = c.r * grow;
          const x = c.x + Math.cos(angle) * r * 0.94;
          const y = c.y + Math.sin(angle) * r * 0.82;
          // Pointing outward from its cluster, which is how a leaf grows.
          const tilt = (angle * 180) / Math.PI;
          return (
            <g
              key={i}
              className="garden-tree-leaf"
              // The delay is what stops the leaves moving as one sheet.
              style={{ animationDelay: `${(i % 7) * 0.44}s` }}
              transform={`translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${tilt.toFixed(1)})`}
            >
              <path
                d="M0 0 Q4.2 -3 8 0 Q4.2 3 0 0 Z"
                fill="var(--color-accent)"
                opacity={night ? 0.2 : 0.34 + warm * 0.16}
              />
            </g>
          );
        })}

        {/*
          One highlight over the whole crown, on the sun's side, and one shadow
          under it. This is the fix for the grapes: nine speculars became two
          forms that agree with a single light.
        */}
        <ellipse
          cx={ROOT_X - shade * 14}
          cy={54}
          rx={26 * grow}
          ry={13 * grow}
          fill="var(--color-accent)"
          // Riding the crown's upper edge on the sun's side, not floating in
          // the middle of it. Two things were wrong before and each render
          // fixed one: at 0.15 and forty units across it overhung the
          // silhouette and read as a separate blob sitting on the tree; shrunk
          // and moved inwards it stopped overhanging and started reading as a
          // hole in the crown instead. Light on a mass hugs the edge nearest
          // the light, so that is where it goes -- flatter, wider, and still
          // faint enough to be light rather than paint.
          opacity={night ? 0.05 : 0.09 + warm * 0.06}
        />
        {/* And its underside, on the shaded flank, by the same rule: against
            the crown's lowest edge rather than across the middle of it, where
            it was reading as a dark band laid over the leaves. */}
        <ellipse
          cx={ROOT_X + shade * 16}
          cy={112}
          rx={36 * grow}
          ry={16 * grow}
          fill="var(--color-base)"
          opacity={night ? 0.28 : 0.14}
        />
      </g>

      {/*
        -- the light through it ----------------------------------------------
        Only by day. Three revisions got here and each one was a silhouette
        problem rather than a colour problem:

        1. Drawn from the sun's own position to the ground. At nine in the
           morning that is a wedge most of the way across the sky, and it read
           as a searchlight.
        2. Redrawn short and under the crown, but as flat polygons at a flat
           opacity -- and a hard-edged shape always reads as an object, so
           three of them under one mass read as legs holding the tree up.
        3. Given a vertical fade, which fixed the top and bottom edges and left
           the two long sides exactly as hard as before.

        What is here now fixes the three things that were actually wrong. Each
        shaft is a faint wide haze with a narrow core inside it, so the sides
        step down instead of ending; they leave the canopy at its **real**
        underside rather than 22 units up inside it, which is what was painting
        a bar across the leaves; and they lean *away* from the sun, which is
        the direction the crown's own shadow has always fallen.
      */}
      {!night && (
        <g className="garden-tree-light">
          {/*
            Fixed ids, like `garden-sun` and `garden-fountain` above: exactly
            one backdrop exists at a time, which `SceneBackdrop` enforces.

            Nothing here is blurred. `feGaussianBlur` would give a true soft
            edge and would also put a filter on a fixed, full-viewport layer
            that repaints behind every scroll on the home screen; two nested
            wedges and a radial stop cost nothing and are close enough at this
            size.
          */}
          <defs>
            <linearGradient id="garden-tree-shaft-fade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0" />
              <stop offset="34%" stopColor="var(--color-accent)" stopOpacity={0.2 + warm * 0.12} />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
            </linearGradient>
            <radialGradient id="garden-tree-pool" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.14 + warm * 0.1} />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Where the whole crown lands, before any shaft: one soft pool with
              no edge to it. This is the shape that says light reached the
              floor here; the shafts and the dapples are detail inside it. */}
          <ellipse
            cx={ROOT_X + shade * 12}
            cy={GROUND}
            rx="62"
            ry="11"
            fill="url(#garden-tree-pool)"
          />

          {SHAFTS.map((offset, i) => {
            const top = ROOT_X + shade * offset;
            const foot = top + shade * LEAN;
            // A wedge from the canopy's underside to the floor, `half` wide at
            // the top and `half * 2` at the foot: light spreads as it falls.
            const wedge = (half: number) =>
              `M${(top - half).toFixed(1)} ${crownFoot.toFixed(1)}`
              + ` L${(top + half).toFixed(1)} ${crownFoot.toFixed(1)}`
              + ` L${(foot + half * 2).toFixed(1)} ${GROUND}`
              + ` L${(foot - half * 2).toFixed(1)} ${GROUND} Z`;
            return (
              <g
                key={offset}
                className="garden-tree-shaft"
                // Staggered, so the three do not brighten and dim together --
                // which would read as the sun flickering rather than as leaves
                // moving in front of it.
                style={{ animationDelay: `${i * 1.7}s` }}
              >
                <path d={wedge(6.5)} fill="url(#garden-tree-shaft-fade)" opacity="0.45" />
                <path d={wedge(2.2)} fill="url(#garden-tree-shaft-fade)" />
              </g>
            );
          })}

          {/* Where each shaft lands. Keyed off the same feet the wedges reach,
              rather than spread evenly either side of the trunk: a dapple that
              is not under a shaft is a stone lying on the grass. */}
          {SHAFTS.map((offset, i) => (
            <ellipse
              key={offset}
              cx={ROOT_X + shade * (offset + LEAN)}
              cy={GROUND + (i % 2) * 2.5}
              rx={6.5 - (i % 3) * 1.4}
              ry="1.7"
              fill="var(--color-accent)"
              opacity={0.22 + warm * 0.14}
            />
          ))}
        </g>
      )}
    </g>
  );
}
