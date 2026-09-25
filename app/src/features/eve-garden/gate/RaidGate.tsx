import { useEffect, useMemo, useState } from 'react';
import {
  canEnter, gateGreeting, type GateCard, type GateVerdict,
} from '../../../domain/rpg/raidGate';
import { clearedCount, currentStage, standingIsland, type WorldProgress } from '../../../domain/rpg/world';
import { GateBackdrop } from './GateBackdrop';
import { GateBoss } from './GateBoss';
import { GatePedestal } from './GatePedestal';
import { IslandTrail } from './IslandTrail';
import { Icon } from '../../../components/icons';

/**
 * The Raid Gate.
 *
 * Top to bottom: the seven islands as a trail, this island's boss standing in
 * the arch between the two trees, the companions you could take, and the one
 * button that commits. The boss is the point of the redesign — a gate that
 * only held five companions was a wardrobe; one with the thing you are going
 * in to fight is a threshold.
 *
 * Everything about *whether* it opens and *who* is on it is decided in
 * `domain/rpg/raidGate.ts` and handed in, and the boss comes from
 * `domain/rpg/islands.ts`. This component owns one piece of state — which
 * companion is ringed — and one decision, which is that a tap selects and does
 * not enter. Tap-to-enter was the first version and it made the scene a menu
 * you fell through.
 *
 * The companions are a list of buttons in DOM order, which is also reading
 * order, so the row and the tab order agree without a `tabindex` anywhere. On a
 * narrow phone the same row scrolls sideways; the layout lives in CSS.
 */

export interface RaidGateProps {
  cards: readonly GateCard[];
  verdict: GateVerdict;
  /** Local hour, 0-23, for the light. */
  hour: number;
  dark: boolean;
  /** How full the tether is, 0-1. */
  resonance: number;
  /** The shared pet's level, which is the same behind every companion. */
  petLevel: number;
  /** Where the couple are in the world, for the trail and the boss. */
  world: WorldProgress;
  onEnter(themeId: string): void;
  /** Absent on a first visit — there is nothing to go back to yet. */
  onCancel?: () => void;
}

export function RaidGate({
  cards, verdict, hour, dark, resonance, petLevel, world, onEnter, onCancel,
}: RaidGateProps) {
  const island = standingIsland(world);
  const [chosen, setChosen] = useState<string | undefined>(verdict.preselected);
  const [refused, setRefused] = useState<string | null>(null);

  // The ring follows the verdict when the verdict changes — a re-entry brings a
  // new preselection, and a gate still showing the previous one would quietly
  // send somebody in behind the wrong companion.
  useEffect(() => { setChosen(verdict.preselected); }, [verdict.preselected]);

  const selected = useMemo(
    () => cards.find((card) => card.themeId === chosen),
    [cards, chosen],
  );

  const greeting = gateGreeting(verdict, selected?.name);

  function choose(themeId: string) {
    setChosen(themeId);
    setRefused(null);
  }

  function enter() {
    const verdictOn = canEnter(cards, chosen);
    if (!verdictOn.ok) {
      setRefused(verdictOn.reason);
      return;
    }
    onEnter(verdictOn.card.themeId);
  }

  return (
    <section className={`page gate${dark ? ' is-dark' : ''}`} aria-label="The Raid Gate">
      <IslandTrail world={world} dark={dark} />

      <div className="gate-scene">
        <GateBackdrop hour={hour} dark={dark} resonance={resonance} />
        <GateBoss
          island={island}
          stage={currentStage(world, island)}
          cleared={clearedCount(world, island)}
          dark={dark}
        />
      </div>

      <div className="gate-roster" role="group" aria-label="Choose a companion">
        {cards.map((card) => (
          <GatePedestal
            key={card.themeId}
            card={card}
            selected={card.themeId === chosen}
            onSelect={choose}
          />
        ))}
      </div>

      <div className="gate-foot-bar">
        <div className="gate-words">
          <h1 className="gate-title">
            {verdict.reason === 'asked' ? 'Change companion' : "Eve's Garden"}
          </h1>
          <p className="gate-greeting">{greeting}</p>
          <p className="gate-level">
            Your pet is level {petLevel}. That much comes with you whoever you pick.
          </p>
          {refused && <p className="gate-refused" role="alert">{refused}</p>}
        </div>

        <div className="gate-actions">
          <button
            type="button"
            className="gate-enter"
            onClick={enter}
            disabled={!selected}
          >
            {selected ? <Icon name="sword" /> : null}
            {selected
              ? verdict.onlyOne ? `Go in with ${selected.name}` : `Enter with ${selected.name}`
              : 'Pick a companion'}
          </button>
          {onCancel && (
            <button type="button" className="gate-back" onClick={onCancel}>
              <Icon name="arrow" turn="left" />
              Not yet
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
