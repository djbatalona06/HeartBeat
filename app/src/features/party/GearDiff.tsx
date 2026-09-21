import { useState } from 'react';
import { previewSwap } from '../../domain/rpg/diff';
import { RAID_STATS, RAID_STAT_NAMES } from '../../domain/rpg/raidStats';
import { gearById, gearForSlot } from '../../domain/rpg/gear';
import { levelOf } from '../../domain/rpg/avatar';
import { refineByItemId, type InventoryItem } from '../../domain/rpg/inventory';
import { levelForXp } from '../../domain/xp';
import { GEAR_SLOTS, type Avatar, type GearSlot } from '../../domain/rpg/types';
import type { House } from '../../domain/rpg/furniture';
import type { PetInstance } from '../../domain/rpg/pets';
import { Chip } from '../../ui/Chip';

/**
 * Would the other boots be better.
 *
 * `RaidSheet` above this says in its own header that this is the question it
 * half-answers: it shows every number and where it came from, but not what a
 * different item would make of them. Working that out meant equipping the
 * thing and reading the sheet again, which is a destructive way to ask a
 * question — and on a slot you had something good in, a nervous one.
 *
 * So: pick a slot, pick something you own, and read the change. Nothing is
 * written. `domain/rpg/diff.ts` carries the arithmetic and the argument for
 * why both columns are yours rather than one being your partner's.
 *
 * Only what is **owned** is offered. A preview of a mythic helm nobody has is
 * a shop window, and the shop is a different screen with its own prices on it.
 */

/**
 * The sentinel for "wear nothing", kept distinct from `null` ("no preview
 * chosen yet"). `previewSwap` wants `undefined` for an empty slot, and an
 * empty string would go in as an item id nothing can look up.
 */
const BARE = '';

export interface GearDiffProps {
  avatar: Avatar;
  owned: InventoryItem[];
  /** The couple's shared pet XP, for the same reason `RaidSheet` takes it. */
  petXp: number;
  house: House;
  companion?: PetInstance;
}

export function GearDiff({ avatar, owned, petXp, house, companion }: GearDiffProps) {
  const [slot, setSlot] = useState<GearSlot>(GEAR_SLOTS[0]);
  const [pick, setPick] = useState<string | null>(null);

  const loadout = {
    petLevel: levelForXp(petXp),
    memberLevel: levelOf(avatar),
    equipped: avatar.gear,
    refineByItemId: refineByItemId(owned),
    house,
    dyeId: avatar.dye,
    companion,
  };

  const ownedIds = new Set(owned.map((row) => row.itemId));
  const wornId = avatar.gear[slot];
  // Owned, in this slot, and not the thing already in it — swapping something
  // for itself is the one preview with nothing to say.
  const options = gearForSlot(slot)
    .filter((item) => ownedIds.has(item.id) && item.id !== wornId);

  const diff = pick === null
    ? null
    : previewSwap(loadout, slot, pick === BARE ? undefined : pick);
  const picked = pick === null || pick === BARE ? null : gearById(pick);

  return (
    <section className="panel gear-diff">
      <h2 className="section-title">Try a swap</h2>
      <p className="section-sub">
        What a different piece would do to the sheet above. Nothing is worn and
        nothing is saved — this only does the arithmetic.
      </p>

      <ul className="gear-diff-slots" aria-label="Slot">
        {GEAR_SLOTS.map((each) => (
          <li key={each}>
            <Chip
              on={each === slot}
              onClick={() => { setSlot(each); setPick(null); }}
            >
              {each}
            </Chip>
          </li>
        ))}
      </ul>

      {options.length === 0 ? (
        <p className="section-sub">
          {wornId
            ? 'Nothing else you own goes in this slot yet.'
            : 'You do not own anything for this slot yet.'}
        </p>
      ) : (
        <ul className="gear-diff-picks" aria-label="Instead of what is worn">
          {options.map((item) => (
            <li key={item.id}>
              <Chip on={item.id === pick} onClick={() => setPick(item.id)}>
                {item.name}
              </Chip>
            </li>
          ))}
        </ul>
      )}

      {/* Taking the slot back to empty, which is a real question: a level that
          fell can make wearing nothing the better move, and nothing else on
          this screen can ask that. Offered only when there is something to
          take off. */}
      {wornId ? (
        <p className="gear-diff-bare">
          <Chip on={pick === BARE} onClick={() => setPick(BARE)}>
            Wear nothing there
          </Chip>
        </p>
      ) : null}

      {diff ? (
        <>
          <p className="gear-diff-head">
            <span className="gear-diff-from">
              {wornId ? gearById(wornId)?.name ?? 'Something' : 'Nothing'}
            </span>
            {' → '}
            <span className="gear-diff-to">{picked?.name ?? 'nothing'}</span>
          </p>

          <ul className="gear-diff-rows">
            {RAID_STATS.map((key) => (
              <li
                key={key}
                className="gear-diff-row"
                // Unchanged stats are dimmed rather than hidden: a swap that
                // moves two of seven numbers should look like that, and a
                // list whose length changes per pick is harder to read than
                // one that does not.
                data-change={changeOf(diff.delta[key])}
              >
                <span className="gear-diff-stat">{RAID_STAT_NAMES[key]}</span>
                <span className="gear-diff-was">{diff.worn.sheet.total[key]}</span>
                <span className="gear-diff-now">{diff.swapped.sheet.total[key]}</span>
                <span className="gear-diff-delta">{signed(diff.delta[key])}</span>
              </li>
            ))}
          </ul>

          <p className="gear-diff-net" data-change={changeOf(diff.netSum)}>
            {netLine(diff.netSum)}
          </p>
        </>
      ) : options.length > 0 ? (
        <p className="section-sub">Pick one to see what it would change.</p>
      ) : null}
    </section>
  );
}

/** Which of the three things a number did, for the data attribute. */
function changeOf(delta: number): 'up' | 'down' | 'same' {
  if (delta > 0) return 'up';
  if (delta < 0) return 'down';
  return 'same';
}

function signed(delta: number): string {
  if (delta === 0) return '—';
  return delta > 0 ? `+${delta}` : `${delta}`;
}

/**
 * The verdict, in words.
 *
 * A swap ranks two items, so saying which is better is the answer rather than
 * a judgement — the thing this app will not rank is two *people*, and both of
 * these columns are the same person's. See the header of `domain/rpg/diff.ts`.
 */
function netLine(net: number): string {
  if (net > 0) return `Better by ${net} across the sheet.`;
  if (net < 0) return `Worse by ${Math.abs(net)} across the sheet.`;
  return 'Exactly as good, by the numbers.';
}
