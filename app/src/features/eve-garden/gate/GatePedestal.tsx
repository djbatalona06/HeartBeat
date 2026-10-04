import type { CSSProperties } from 'react';
import { getMascot } from '../../pet/mascots';
import { RAID_STAT_NAMES } from '../../../domain/rpg/raidStats';
import { TIER_NAMES } from '../../../domain/rpg/tiers';
import { MAX_AFFINITY_RANK, statBubbles, type GateCard } from '../../../domain/rpg/raidGate';

/**
 * One companion, as a card in the gate's roster: who it is, and bubbles.
 *
 * The card used to carry species, element, the moves, the skills, the passive
 * and the affinity sentence, which made choosing a companion a reading test.
 * It now answers the one question the gate asks — how built-up is this one —
 * as a rank bubble by the name and one bubble per stat it leans on. The moves
 * are on the move bar once you are in; nothing is lost, only moved to where it
 * is used.
 *
 * Each ring is filled with a CSS custom property, and every bubble carries its
 * number and a visually-hidden sentence, so the fill is never the only signal.
 * A button rather than a div with a click handler, so it is reachable by
 * keyboard and announced as selectable without any aria plumbing of its own.
 */

export interface GatePedestalProps {
  card: GateCard;
  selected: boolean;
  /**
   * The boss's weakness, when this kit really hits harder on it
   * (`favoursWeakness`). The one reason to swap pets for a fight, said on the
   * card rather than left for somebody to work out from the move bar.
   */
  strongHere?: string;
  onSelect(themeId: string): void;
}

const fillStyle = (fill: number) => ({ '--fill': fill.toFixed(3) }) as CSSProperties;

export function GatePedestal({ card, selected, strongHere, onSelect }: GatePedestalProps) {
  const mascot = getMascot(card.themeId);
  const mood = selected ? 'happy' : 'content';

  return (
    <button
      type="button"
      className="raid-gate-pedestal"
      data-selected={selected || undefined}
      data-unavailable={!card.available || undefined}
      data-tier={card.tier}
      aria-pressed={selected}
      disabled={!card.available}
      onClick={() => onSelect(card.themeId)}
    >
      <span className="raid-gate-figure">
        <mascot.Art mood={mood} />
      </span>

      <span className="raid-gate-plinth" aria-hidden="true" />

      <span className="raid-gate-card">
        <span className="raid-gate-card-top">
          <span className="raid-gate-name">{card.name}</span>
          <span
            className="raid-gate-bubble raid-gate-bubble-rank"
            data-tier={card.tier}
            style={fillStyle(card.rank / MAX_AFFINITY_RANK)}
          >
            <span className="raid-gate-bubble-value">{card.rank}</span>
            <span className="visually-hidden">
              {`, ${TIER_NAMES[card.tier]}, rank ${card.rank} of ${MAX_AFFINITY_RANK}`}
            </span>
          </span>
        </span>

        {strongHere ? (
          <span className="raid-gate-strong">
            Strong here
            <span className="visually-hidden">{`: hits harder on this boss, which is weak to ${strongHere.toLowerCase()}`}</span>
          </span>
        ) : null}

        {card.available ? (
          <span className="raid-gate-bubbles">
            {statBubbles(card).map(({ stat, value, fill }) => (
              <span key={stat} className="raid-gate-bubble" style={fillStyle(fill)}>
                <span className="raid-gate-bubble-value">{value}</span>
                <span className="raid-gate-bubble-label" aria-hidden="true">{RAID_STAT_NAMES[stat]}</span>
                <span className="visually-hidden">
                  {`, ${RAID_STAT_NAMES[stat]} ${value}, ${Math.round(fill * 100)}% of the way to its cap`}
                </span>
              </span>
            ))}
          </span>
        ) : (
          <span className="raid-gate-affinity">{card.unavailableBecause}</span>
        )}
      </span>
    </button>
  );
}
