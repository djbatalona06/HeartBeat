import { useState } from 'react';
import {
  CHESTS, PRIZES_PER_CHEST, chestChances, chestPityFloor, pityLine, poolOf, type Chest,
} from '../../domain/rpg/chests';
import { TIER_NAMES } from '../../domain/rpg/tiers';
import { ChestArt } from '../chest/ChestArt';

/**
 * The three chests, and the odds printed on them.
 *
 * ## Why the odds are on the screen
 *
 * For the reason the egg's already are, written out at length in `pets.ts`: a
 * pity system silently lifts the real rate above the printed one, so a chest
 * showing a flat table next to a guarantee it does not mention is telling a
 * small lie every twelfth draw. `chestChances` is asked for the odds of *this*
 * couple's **next** draw with their luck and their counter already folded in,
 * which is the only table worth showing anybody.
 *
 * The counter is on the front of each chest rather than behind the accordion.
 * A floor nobody can see is not a kindness, it is a hidden number — and said
 * plainly it is also the thing that makes a bad run bearable while it is
 * happening.
 *
 * ## Why the odds are collapsed by default
 *
 * Because the pity line is the sentence that matters and a five-row percentage
 * table above it competes with it. The table is one tap away and it is never
 * behind a purchase, which is the whole of what "published odds" has to mean.
 *
 * ## Three items, and what that does to a published table
 *
 * A chest hands over `PRIZES_PER_CHEST` items and each one is rolled on the
 * table shown here, so the percentages are unchanged and still true per item.
 * The floor is the part that needed saying: it lifts **one** item to the pity
 * tier, not all three, and the table's footnote says so. A table that let
 * somebody infer three guaranteed legendaries would be exactly the small lie
 * this panel exists to avoid, told in the generous direction.
 */

export interface ChestAlcoveProps {
  coins: number;
  luck: number;
  /** Draws since each chest last paid out, keyed by chest id. */
  pity: Readonly<Record<string, number>>;
  busy: boolean;
  onOpen(chestId: string): void;
}

export function ChestAlcove({ coins, luck, pity, busy, onOpen }: ChestAlcoveProps) {
  const [odds, setOdds] = useState<string | null>(null);

  return (
    <section className="panel chests">
      <h2 className="section-title">Chests</h2>
      <p className="section-sub">
        {coins} coins. {PRIZES_PER_CHEST} items in every chest, and every chest
        is insured: go long enough without a good one and the next is
        guaranteed.
      </p>

      <ul className="chest-row">
        {CHESTS.map((chest) => {
          const count = pity[chest.id] ?? 0;
          const floored = chestPityFloor(chest, count) !== null;
          const afford = coins >= chest.price;
          const open = odds === chest.id;

          return (
            <li key={chest.id} className="chest" data-chest={chest.id} data-floored={floored || undefined}>
              <ChestArt id={chest.id} />

              <h3 className="chest-name">{chest.name}</h3>
              <p className="chest-blurb">{chest.blurb}</p>

              <p className="chest-pool">
                {poolOf(chest).map((tier) => TIER_NAMES[tier]).join(' · ')}
              </p>

              <p className="chest-pity" data-live={floored || undefined}>
                {pityLine(chest, count)}
              </p>

              <button
                type="button"
                className="chest-open"
                disabled={!afford || busy}
                onClick={() => onOpen(chest.id)}
              >
                {afford ? `Open · ${chest.price}` : `${chest.price - coins} more coins`}
              </button>

              <button
                type="button"
                className="chest-odds-toggle"
                aria-expanded={open}
                onClick={() => setOdds(open ? null : chest.id)}
              >
                {open ? 'Hide odds' : 'Odds'}
              </button>

              {open && <ChestOdds chest={chest} luck={luck} pity={count} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The table for the next draw from this chest. Never for a draw in general. */
function ChestOdds({ chest, luck, pity }: { chest: Chest; luck: number; pity: number }) {
  const chances = chestChances(chest, luck, pity);
  const floored = chestPityFloor(chest, pity) !== null;

  return (
    <div className="chest-odds">
      <ul className="odds-table">
        {poolOf(chest).map((tier) => (
          <li
            key={tier}
            className="odds-row"
            data-rarity={tier}
            data-none={chances[tier] === 0 || undefined}
          >
            <span className="odds-name">{TIER_NAMES[tier]}</span>
            <span className="odds-chance">{(chances[tier] * 100).toFixed(1)}%</span>
          </li>
        ))}
      </ul>
      <p className="chest-odds-foot">
        {`Each of the ${PRIZES_PER_CHEST} items is rolled on this table. `}
        {floored
          // What the floor does and does not promise, in the one place
          // somebody is reading percentages. It lifts one item, not three:
          // three guaranteed legendaries would be a jackpot wearing the word
          // "insurance", and `openChest` says the same thing in code.
          ? 'The floor is in force, so one of them is guaranteed at or above it.'
          : 'These are the odds for your next chest, not in general.'}
        {luck > 0 ? ' Your luck is already folded in.' : ''}
      </p>
    </div>
  );
}
