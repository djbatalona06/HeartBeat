import { getMascot } from '../../pet/mascots';
import type { GateCard } from '../../../domain/rpg/raidGate';
import { StatWheel } from './StatWheel';

/**
 * One companion, as a card in the gate's roster: who it is, and what it is built around.
 *
 * The card used to carry species, element, the moves, the skills, the passive
 * and the affinity sentence, which made choosing a companion a reading test.
 * It now answers the one question the gate asks — what is this one built
 * around — with a stat wheel (`StatWheel`) under the name. Every companion is
 * worth the same at the couple's level, so the wheel's shape is the whole
 * difference between them, and the level in its centre is the same on all five.
 * The moves are on the move bar once you are in; nothing is lost, only moved to
 * where it is used.
 *
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
        <span className="raid-gate-name">{card.name}</span>

        {strongHere ? (
          <span className="raid-gate-strong">
            Strong here
            <span className="visually-hidden">{`: hits harder on this boss, which is weak to ${strongHere.toLowerCase()}`}</span>
          </span>
        ) : null}

        {card.available ? (
          <StatWheel card={card} />
        ) : (
          <span className="raid-gate-affinity">{card.unavailableBecause}</span>
        )}
      </span>
    </button>
  );
}
