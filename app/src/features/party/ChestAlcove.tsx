import { useState } from 'react';
import {
  CHESTS, chestChances, chestPityFloor, pityLine, poolOf, type Chest,
} from '../../domain/rpg/chests';
import { TIER_NAMES } from '../../domain/rpg/tiers';

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
        {coins} coins. Every chest is insured: go long enough without a good one
        and the next is guaranteed.
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
        {floored
          ? 'The floor is in force, so the bottom of this chest is off the table.'
          : 'The odds for your next draw, not in general.'}
        {luck > 0 ? ' Your luck is already folded in.' : ''}
      </p>
    </div>
  );
}

/**
 * Three chests, drawn rather than fetched.
 *
 * The same lid and the same body each time, because they are three chests and
 * not three unrelated objects; what changes is the banding and how much of the
 * accent is on it. That is what makes the ladder readable at a glance without
 * anybody reading the word "gilded".
 */
function ChestArt({ id }: { id: string }) {
  const bands = id === 'wooden' ? 1 : id === 'silver' ? 2 : 3;
  return (
    <svg viewBox="0 0 100 80" aria-hidden="true" className="chest-art" data-chest={id}>
      {/* The lid, a half-barrel. */}
      <path d="M12 38 Q50 6 88 38 Z" fill="var(--color-surface-muted)" />
      <path d="M12 38 Q50 6 88 38" fill="none" stroke="var(--color-text)" strokeWidth="3" />
      {/* The body. */}
      <rect x="12" y="38" width="76" height="32" rx="3" fill="var(--color-surface-muted)" />
      <rect
        x="12" y="38" width="76" height="32" rx="3"
        fill="none" stroke="var(--color-text)" strokeWidth="3"
      />
      {/* Banding: one strap for wooden, two for silver, three for gilded. */}
      {Array.from({ length: bands }, (_, i) => {
        const x = 50 + (i - (bands - 1) / 2) * 24;
        return (
          <path
            key={x}
            d={`M${x} 20 Q${x} 30 ${x} 38 L${x} 70`}
            stroke="var(--color-accent)"
            strokeWidth={bands === 3 ? 5 : 4}
            fill="none"
            opacity={0.5 + bands * 0.15}
          />
        );
      })}
      {/* The lock, which is the one place the gilded chest is actually gold. */}
      <rect
        x="44" y="40" width="12" height="12" rx="2"
        fill={bands === 3 ? '#f5c85c' : 'var(--color-accent)'}
      />
    </svg>
  );
}
