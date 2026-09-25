import { petArt } from '../party/art/pets';
import { petKindById } from '../../domain/rpg/pets';
import type { PetInstance } from '../../domain/rpg/pets';

/**
 * Where the companions you are not using actually live.
 *
 * The garden had a habitat zone in the plan and, until this, a link to the Birb
 * tab in its place — which is a description of a habitat rather than one. A
 * companion you hatched and did not take through the gate was, on this screen,
 * nowhere at all.
 *
 * ## Why they are DOM and not sprites
 *
 * They do not fight, they cannot be walked into, and nothing about them needs a
 * tile. Putting five idle figures into the Phaser scene would mean five more
 * baked textures per theme and five more things the collision model has to be
 * told to ignore, to draw something that is deliberately in the background.
 * They are the same `petArt` drawings the Birb page uses.
 *
 * ## Roaming, and reacting
 *
 * Each one drifts on its own loop, at its own speed, offset by its index — so
 * five companions look like five animals rather than one animation played five
 * times. `pulse` is bumped by the page every time a log lands, and every figure
 * hops once: the reaction the plan asked for, and the cheapest honest version
 * of it. They react to the couple logging, not to which log it was, because a
 * companion that behaved differently for a mood than for a workout would be
 * making a judgement about the two.
 */

export interface GardenHabitatProps {
  /** Every companion this member has hatched. */
  pets: readonly PetInstance[];
  /** The one that came through the gate, by kind id, drawn a little larger. */
  activeKindId?: string;
  /** Bumped on every log. Any change makes the whole habitat hop once. */
  pulse: number;
}

/** Past this, the habitat is a crowd rather than a place. The rest are on the
 *  Birb tab, which is the screen that is actually a list. */
const SHOWN = 6;

export function GardenHabitat({ pets, activeKindId, pulse }: GardenHabitatProps) {
  const shown = pets.slice(0, SHOWN);
  if (shown.length === 0) return null;

  return (
    <div className="garden-habitat" key={pulse} aria-hidden="true">
      {shown.map((pet, index) => {
        const kind = petKindById(pet.kindId);
        const Art = petArt(pet.kindId);
        if (!kind || !Art) return null;
        const active = pet.kindId === activeKindId;

        return (
          <span
            key={pet.id}
            className="garden-resident"
            data-active={active || undefined}
            title={kind.name}
            style={{
              // Its own lane and its own pace, so six of them do not move as
              // one. Prime-ish offsets, because round ones re-sync visibly.
              '--resident-index': index,
              '--resident-delay': `${index * 0.7}s`,
              '--resident-pace': `${5.5 + index * 1.3}s`,
            } as React.CSSProperties}
          >
            <Art />
          </span>
        );
      })}
    </div>
  );
}
