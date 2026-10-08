import { useMemo } from 'react';
import { RAID_STAT_NAMES } from '../../../domain/rpg/raidStats';
import { wheelPoints, wheelSpokes, type GateCard } from '../../../domain/rpg/raidGate';

/**
 * A companion's stat wheel: seven spokes, one per raid stat, in the same order
 * on every card, with the filled shape showing what this one brings.
 *
 * It replaces the rank bubble and the three little rings. The rank was the
 * wrong thing to put in front of somebody choosing a companion — it was how
 * often they had picked this one before, and it priced the pet in the fight —
 * so the centre now carries the couple's level, which is the same number on all
 * five cards. What differs from card to card is the *shape*.
 *
 * Drawn in one viewBox and scaled by CSS, so it is as small as a third of a
 * phone's width asks. Colour comes from the pack's tokens in the stylesheet,
 * never a literal here, and nothing animates, so calm and reduced motion have
 * nothing to switch off.
 *
 * The shape is never the only signal: it is `role="img"` with the level and
 * the stats it brings said in words.
 */

const SIZE = 100;
const CENTRE = { x: SIZE / 2, y: SIZE / 2 };
const RADIUS = 46;

export interface StatWheelProps {
  card: Pick<GateCard, 'source' | 'leans' | 'level'>;
}

const toPath = (points: readonly { x: number; y: number }[]) =>
  `${points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ')} Z`;

export function StatWheel({ card }: StatWheelProps) {
  const spokes = useMemo(() => wheelSpokes(card), [card]);
  const tips = useMemo(() => wheelPoints(spokes.map(() => 1), RADIUS, CENTRE), [spokes]);
  const corners = useMemo(() => wheelPoints(spokes.map((s) => s.reach), RADIUS, CENTRE), [spokes]);
  const halfway = useMemo(() => wheelPoints(spokes.map(() => 0.5), RADIUS, CENTRE), [spokes]);

  const said = [...spokes]
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value)
    .map((s) => `${RAID_STAT_NAMES[s.stat]} ${s.value}`)
    .join(', ');

  return (
    <span className="raid-gate-wheel">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`Level ${card.level}. ${said}.`}>
        <path className="raid-gate-wheel-rim" d={toPath(tips)} />
        <path className="raid-gate-wheel-rim raid-gate-wheel-half" d={toPath(halfway)} />
        {tips.map((tip, i) => (
          <line key={spokes[i].stat} className="raid-gate-wheel-spoke" x1={CENTRE.x} y1={CENTRE.y} x2={tip.x} y2={tip.y} />
        ))}
        <path className="raid-gate-wheel-shape" d={toPath(corners)} />
        {spokes.map((spoke, i) => (spoke.value > 0 ? (
          <circle
            key={spoke.stat}
            className="raid-gate-wheel-dot"
            data-leans={spoke.leans || undefined}
            cx={corners[i].x}
            cy={corners[i].y}
            r={spoke.leans ? 3.4 : 2.4}
          />
        ) : null))}
      </svg>
      <span className="raid-gate-wheel-level" aria-hidden="true">
        <span className="raid-gate-wheel-lv">LV</span>
        {card.level}
      </span>
    </span>
  );
}
