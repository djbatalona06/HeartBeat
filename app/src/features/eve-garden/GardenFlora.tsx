import { floraById, plotById, type Garden } from '../../domain/rpg/plots';
import type { Flora } from '../../domain/rpg/plots';

/**
 * What is growing in the plots, drawn where the plots are.
 *
 * Eight shapes, one per `Flora.art`, and they are drawn rather than fetched for
 * the reason the rest of `GardenBackdrop` is: every fill is a theme token, so a
 * palette change repaints the whole garden without a single texture being
 * re-baked.
 *
 * The plot decides the position and the plant decides the shape, which is why
 * this takes a `Garden` and not a list — the two halves are stored apart
 * (ground is earned, plants are bought) and this is where they meet.
 *
 * ## Bare plots are drawn too
 *
 * A plot you have reached and not planted shows as turned soil. That is the
 * whole of the "empty plots can be grown" idea working: the garden asks for
 * something by having a visible gap in it, rather than by a badge on a tab.
 */

export interface GardenFloraProps {
  garden: Garden;
  /** The plots this couple has actually reached. */
  plots: readonly { id: string; x: number; depth: number }[];
}

export function GardenFlora({ garden, plots }: GardenFloraProps) {
  return (
    <g className="garden-flora">
      {plots.map((plot) => {
        const full = plotById(plot.id);
        if (!full) return null;
        // Across the 400-wide viewBox, and up the near third of it: the plots
        // live in front of the tree line and behind the fountain's basin.
        const x = 200 + plot.x * 176;
        const y = 232 - plot.depth * 44;
        const scale = 1 - plot.depth * 0.25;
        const flora = floraById(garden[plot.id]);

        return (
          <g key={plot.id} transform={`translate(${x} ${y}) scale(${scale})`}>
            <Soil planted={flora !== undefined} />
            {flora && <Plant art={flora.art} />}
          </g>
        );
      })}
    </g>
  );
}

/** Turned earth. Dashed when bare, so a gap reads as an invitation. */
function Soil({ planted }: { planted: boolean }) {
  return (
    <ellipse
      cx="0" cy="0" rx="17" ry="6"
      fill="var(--color-surface-muted)"
      opacity={planted ? 0.75 : 0.45}
      stroke="var(--color-accent)"
      strokeWidth={planted ? 0 : 1.2}
      strokeDasharray={planted ? undefined : '3 3'}
    />
  );
}

/** One plant, by shape. Everything sits on the soil at y=0 and grows upward. */
function Plant({ art }: { art: Flora['art'] }) {
  switch (art) {
    case 'bed':
      // Three stems, three blooms. A rose bed at this size is three roses.
      return (
        <g>
          <path
            d="M-7 0 L-7 -13 M0 0 L0 -17 M7 0 L7 -12"
            stroke="var(--color-text-muted)" strokeWidth="1.6" strokeLinecap="round"
          />
          <circle cx="-7" cy="-14" r="3.4" fill="var(--color-accent)" />
          <circle cx="0" cy="-18" r="4" fill="var(--color-accent)" />
          <circle cx="7" cy="-13" r="3.2" fill="var(--color-accent)" opacity="0.8" />
        </g>
      );

    case 'post':
      return (
        <g>
          <path d="M0 0 L0 -24" stroke="var(--color-text-muted)" strokeWidth="2.4" />
          <circle cx="0" cy="-27" r="9" fill="var(--color-accent)" opacity="0.22" />
          <path d="M-5 -24 L5 -24 L3 -32 L-3 -32 Z" fill="var(--color-accent)" />
        </g>
      );

    case 'bench':
      return (
        <g>
          <rect x="-14" y="-12" width="28" height="3.5" rx="1.5" fill="var(--color-surface)" />
          <rect x="-14" y="-20" width="28" height="3" rx="1.5" fill="var(--color-surface)" opacity="0.8" />
          <path
            d="M-11 -12 L-11 0 M11 -12 L11 0"
            stroke="var(--color-text-muted)" strokeWidth="2.2" strokeLinecap="round"
          />
        </g>
      );

    case 'bath':
      return (
        <g>
          <path d="M0 0 L0 -12" stroke="var(--color-text-muted)" strokeWidth="3" />
          <ellipse cx="0" cy="-14" rx="11" ry="4" fill="var(--color-surface)" />
          <ellipse cx="0" cy="-15" rx="8" ry="2.6" fill="var(--color-accent)" opacity="0.65" />
        </g>
      );

    case 'chime':
      return (
        <g>
          <path d="M-9 -26 L9 -26" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" />
          <path d="M0 -26 L0 -34" stroke="var(--color-text-muted)" strokeWidth="1.6" />
          {/* Four tubes of different lengths, which is the whole of a chime. */}
          <path
            d="M-7 -26 L-7 -14 M-2 -26 L-2 -18 M3 -26 L3 -11 M8 -26 L8 -16"
            stroke="var(--color-accent)" strokeWidth="1.8" strokeLinecap="round"
          />
        </g>
      );

    case 'stone':
      return (
        <path
          d="M-8 0 L-10 -20 L-3 -30 L6 -27 L9 -8 L6 0 Z"
          fill="var(--color-text-muted)"
          opacity="0.9"
        />
      );

    case 'hive':
      return (
        <g>
          <ellipse cx="0" cy="-6" rx="12" ry="6" fill="var(--color-accent)" opacity="0.8" />
          <ellipse cx="0" cy="-14" rx="10" ry="5.5" fill="var(--color-accent)" opacity="0.7" />
          <ellipse cx="0" cy="-21" rx="7" ry="4.5" fill="var(--color-accent)" opacity="0.6" />
          <circle cx="0" cy="-6" r="2" fill="var(--color-base)" />
        </g>
      );

    case 'tree':
    default:
      return (
        <g>
          <path d="M0 0 L0 -18" stroke="var(--color-text-muted)" strokeWidth="3.2" />
          <ellipse cx="0" cy="-26" rx="15" ry="12" fill="var(--color-surface)" />
          <circle cx="-6" cy="-24" r="2.4" fill="var(--color-accent)" />
          <circle cx="5" cy="-29" r="2.2" fill="var(--color-accent)" />
          <circle cx="7" cy="-21" r="2" fill="var(--color-accent)" opacity="0.8" />
        </g>
      );
  }
}
