import { getMascot } from '../../pet/mascots';
import { RAID_STAT_NAMES } from '../../../domain/rpg/raidStats';
import { TIER_NAMES } from '../../../domain/rpg/tiers';
import { MAX_AFFINITY_RANK, skillPreview, type GateCard } from '../../../domain/rpg/raidGate';

/**
 * One companion, on one pedestal, at its place in the arch.
 *
 * A button rather than a div with a click handler, so it is reachable by
 * keyboard and announced as selectable without any aria plumbing of its own.
 * The arch position arrives as CSS custom properties rather than as inline
 * `left`/`top`, so the stylesheet owns the geometry and can lay the same five
 * cards out as a column on a narrow phone without this component knowing.
 */

export interface GatePedestalProps {
  card: GateCard;
  selected: boolean;
  onSelect(themeId: string): void;
}

export function GatePedestal({ card, selected, onSelect }: GatePedestalProps) {
  const mascot = getMascot(card.themeId);
  const mood = selected ? 'happy' : 'content';

  return (
    <button
      type="button"
      className="gate-pedestal"
      data-selected={selected || undefined}
      data-unavailable={!card.available || undefined}
      data-tier={card.tier}
      style={{
        '--gate-x': card.slot.x,
        '--gate-depth': card.slot.depth,
        '--gate-scale': card.slot.scale,
        '--gate-index': card.slot.index,
      } as React.CSSProperties}
      aria-pressed={selected}
      disabled={!card.available}
      onClick={() => onSelect(card.themeId)}
    >
      <span className="gate-figure">
        <mascot.Art mood={mood} />
      </span>

      <span className="gate-plinth" aria-hidden="true" />

      <span className="gate-card">
        <span className="gate-card-top">
          <span className="gate-name">{card.name}</span>
          <span className="gate-rank" data-tier={card.tier}>
            {TIER_NAMES[card.tier]} · {card.rank}/{MAX_AFFINITY_RANK}
          </span>
        </span>

        <span className="gate-species">{card.species} · {card.element}</span>

        <span className="gate-leans">
          {card.leans.map((stat) => (
            <span key={stat} className="gate-lean">{RAID_STAT_NAMES[stat]}</span>
          ))}
        </span>

        <span className="gate-skill">{skillPreview(card)}</span>

        <span className="gate-foot">
          {card.resonance > 0
            ? `+${card.resonance}% to the tether`
            : card.kit.passive.description}
        </span>

        {card.available ? (
          <span className="gate-affinity">
            {card.affinity === 0
              ? 'Never taken out.'
              : card.toNextRank === null
                ? `${card.affinity} rounds. Nothing left to prove.`
                : `${card.affinity} rounds · ${card.toNextRank} to the next rank`}
          </span>
        ) : (
          <span className="gate-affinity">{card.unavailableBecause}</span>
        )}
      </span>
    </button>
  );
}
