import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useToast } from '../../ui/Toast';
import { Sheet } from '../../ui/Sheet';
import { SecondaryAction } from '../../ui/SecondaryAction';
import {
  ensureIdentity, equipItem, getOrCreateAvatar, holdingsOf, unequipSlot,
} from '../../db/repository';
import { levelOf } from '../../domain/rpg/avatar';
import { levelForXp } from '../../domain/xp';
import {
  AMULET_UNLOCK_LEVEL, RARITY_NAMES, SLOT_NAMES, slotOpen, type GearItem,
} from '../../domain/rpg/gear';
import { gearShelves, summarize, type GearShelf, type OwnedGear } from '../../domain/rpg/holdings';
import { refineByItemId } from '../../domain/rpg/inventory';
import { gearSources } from '../../domain/rpg/loadout';
import { passiveFor } from '../../domain/rpg/tiers';
import type { GearSlot } from '../../domain/rpg/types';
import { gearArt } from '../party/art/gear';
import { RaidSheet } from '../party/RaidSheet';
import { RAID_STAT_NAMES } from '../../domain/rpg/raidStats';
import type { House } from '../../domain/rpg/furniture';
import type { Garden } from '../../domain/rpg/plots';

/**
 * The bag: your gear, and the sheet it adds up to.
 *
 * It used to be everything this member owned — gear, companions, finished
 * to-dos and streaks — on the argument that the app knew all of it and had
 * nowhere to say it. Each of those has a better home now: companions are
 * chosen on Birb, next to the colourway and the room, and the finished list
 * sits under Tasks, the list it came from. What is left is the wardrobe, and
 * the raid sheet that says what the wardrobe is worth.
 *
 * Every write here goes to the same `equipItem` / `unequipSlot` the rest of the
 * app uses, so there is exactly one code path that can put an item on.
 */

/** The four slots of the grid, head to foot with the hand last. The amulet
 *  stands beside it, because it opens later — see `AMULET_UNLOCK_LEVEL`. */
const GRID_SLOTS: readonly GearSlot[] = ['helmet', 'chestplate', 'boots', 'weapon'];

export function AssetsPage() {
  const [identity, setIdentity] = useState<{ memberId: string; coupleId: string } | null>(null);
  const [looking, setLooking] = useState<GearSlot | null>(null);
  const { say } = useToast();

  // The avatar has to exist before the shelves can know what level gates what.
  useEffect(() => {
    let live = true;
    ensureIdentity().then(async (next) => {
      await getOrCreateAvatar(next.memberId, next.coupleId);
      if (live) setIdentity(next);
    }).catch(() => {});
    return () => { live = false; };
  }, []);

  // One live query over every table the page reads rather than one each.
  // Dexie observes every table the callback reads, so this stays reactive to a
  // purchase and an equip alike — without the intermediate renders where the
  // wallet has been debited and the item has not arrived. See `holdingsOf`.
  const holdings = useLiveQuery(
    async () => (identity ? holdingsOf(identity.memberId) : undefined),
    [identity?.memberId],
  );
  const avatar = holdings?.avatar;

  if (!identity || !holdings || !avatar) {
    return (
      <div className="page">
        <header className="page-head">
          <h1 className="page-title">Bag</h1>
          <p className="page-sub">Opening it up…</p>
        </header>
      </div>
    );
  }

  const level = levelOf(avatar);
  const petLevel = levelForXp(holdings.pet?.xp ?? 0);
  const refine = refineByItemId(holdings.gear);
  const shelves = gearShelves(holdings.gear, avatar.gear, level);
  const totals = summarize(shelves, [], [], []);
  const shelfOf = (slot: GearSlot) => shelves.find((shelf) => shelf.slot === slot)!;

  const onEquip = async (itemId: string) => {
    const result = await equipItem(identity.memberId, identity.coupleId, itemId);
    if (result && !result.ok) say(result.reason ?? 'That would not go on.', 'error');
  };
  const onUnequip = (slot: GearSlot) => unequipSlot(identity.memberId, identity.coupleId, slot);

  // What one item is worth on the sheet, through the sheet's own arithmetic:
  // `gearSources` is what `RaidSheet` above adds up, so the tile and the sheet
  // cannot disagree about refinement, the cap on it, or a level gate.
  const worth = (item: GearItem) => gearSources({ [item.slot]: item.id }, level, refine)[0];

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">Bag</h1>
        <p className="page-sub">Your gear, and the stat sheet it adds up to.</p>
      </header>

      <section className="panel">
        <div className="asset-totals">
          <Total value={avatar.coins} label={avatar.coins === 1 ? 'coin' : 'coins'} />
          <Total value={totals.gearCount} label="gear" sub={`${totals.wornCount} worn`} />
        </div>
        <p className="section-sub asset-shop-note">
          New gear is bought in the <Link to="/shop">Shop</Link>.
        </p>
      </section>

      {/* The same component `/raid` renders, not a copy — one implementation,
          two callers, the argument `ChestAlcove` makes about published odds.
          "Would the other boots be better" is a question asked at the
          wardrobe, and this is the wardrobe. */}
      <RaidSheet
        avatar={avatar}
        owned={holdings.gear}
        petXp={holdings.pet?.xp ?? 0}
        house={(holdings.pet?.house ?? {}) as House}
        garden={holdings.pet?.plots as Garden | undefined}
        companion={holdings.pets.find((each) => each.id === avatar.companionId)}
      />

      <section className="panel">
        <h2 className="section-title">Gear</h2>
        <p className="section-sub">
          Tap a slot to see what it gives, and to swap it for something else you own.
        </p>
        <div className="gear-board">
          <ul className="gear-grid">
            {GRID_SLOTS.map((slot) => (
              <SlotTile
                key={slot}
                shelf={shelfOf(slot)}
                open
                worth={worth}
                onOpen={() => setLooking(slot)}
              />
            ))}
          </ul>
          <ul className="gear-side">
            <SlotTile
              shelf={shelfOf('amulet')}
              open={slotOpen('amulet', petLevel)}
              worth={worth}
              onOpen={() => setLooking('amulet')}
            />
          </ul>
        </div>
      </section>

      <SlotSheet
        shelf={looking ? shelfOf(looking) : null}
        worth={worth}
        onClose={() => setLooking(null)}
        onEquip={onEquip}
        onUnequip={onUnequip}
      />
    </div>
  );
}

function Total({ value, label, sub }: { value: number; label: string; sub?: string }) {
  return (
    <div className="asset-total">
      <span className="asset-total-value">{value}</span>
      <span className="asset-total-label">{label}</span>
      {sub ? <span className="asset-total-sub">{sub}</span> : null}
    </div>
  );
}

type Worth = (item: GearItem) => ReturnType<typeof gearSources>[number] | undefined;

/**
 * An item's number on the sheet, in words: the stat level on the slot's first
 * raid stat, and its passive if its tier carries one. The passive lands on that
 * same stat and nowhere else — see `raidStats.ts`.
 */
function worthLine(source: NonNullable<ReturnType<Worth>>): string {
  const stat = RAID_STAT_NAMES[source.order[0]];
  const passive = passiveFor(source.tier, source.statLevel);
  return `${source.statLevel} ${stat}${passive > 0 ? ` · +${passive}% ${stat}` : ''}`;
}

/**
 * One slot of the grid: what is on it, or that nothing is.
 *
 * A closed slot is not a button. It has nothing to open, and a control that
 * silently does nothing is indistinguishable from a broken one — so it is a
 * tile that says when it opens, in words rather than only in a tooltip.
 */
function SlotTile({ shelf, open, worth, onOpen }: {
  shelf: GearShelf;
  open: boolean;
  worth: Worth;
  onOpen: () => void;
}) {
  const name = SLOT_NAMES[shelf.slot];

  if (!open) {
    return (
      <li>
        <div
          className="asset-card gear-slot"
          data-locked="true"
          title={`From level ${AMULET_UNLOCK_LEVEL}`}
        >
          <span className="gear-slot-name">{name}</span>
          <span className="asset-card-art" aria-hidden="true" />
          <span className="asset-card-flag asset-card-flag-locked">
            Opens at pet level {AMULET_UNLOCK_LEVEL}
          </span>
        </div>
      </li>
    );
  }

  const worn = shelf.owned.find((entry) => entry.worn);
  const Art = worn ? gearArt(worn.item.id) : undefined;
  const source = worn ? worth(worn.item) : undefined;
  const spare = shelf.owned.length - (worn ? 1 : 0);

  return (
    <li>
      <button
        type="button"
        className="asset-card gear-slot"
        data-tier={worn?.item.rarity}
        data-worn={worn ? 'true' : undefined}
        onClick={onOpen}
        aria-haspopup="dialog"
      >
        <span className="gear-slot-name">{name}</span>
        <span className="asset-card-art">{Art ? <Art /> : null}</span>
        <span className="asset-card-name">{worn ? worn.item.name : 'Empty'}</span>
        {worn ? (
          <span className="asset-card-meta">
            {RARITY_NAMES[worn.item.rarity]}{worn.row.refine > 0 ? ` +${worn.row.refine}` : ''}
          </span>
        ) : null}
        {source ? <span className="asset-card-stat">{worthLine(source)}</span> : null}
        {spare > 0 ? (
          <span className="asset-card-flag">{spare} {worn ? 'more ' : ''}in the bag</span>
        ) : null}
      </button>
    </li>
  );
}

/**
 * One slot, looked at: what is on it and what it gives, and everything else
 * you own for it beside that, with the difference each would make.
 *
 * The only detail view gear has anywhere. Before it, what an item was worth
 * was one number on a card, and comparing two meant remembering the first.
 */
function SlotSheet({ shelf, worth, onClose, onEquip, onUnequip }: {
  shelf: GearShelf | null;
  worth: Worth;
  onClose: () => void;
  onEquip: (itemId: string) => void;
  onUnequip: (slot: GearSlot) => void;
}) {
  const worn = shelf?.owned.find((entry) => entry.worn);
  const others = shelf?.owned.filter((entry) => !entry.worn) ?? [];
  const wornLevel = worn ? worth(worn.item)?.statLevel ?? 0 : 0;

  return (
    <Sheet
      open={shelf !== null}
      onClose={onClose}
      label={shelf ? SLOT_NAMES[shelf.slot] : 'Gear'}
      scrimClassName="menu-scrim"
      panelClassName="gear-sheet"
    >
      {shelf ? (
        <>
          <h2 className="section-title">{SLOT_NAMES[shelf.slot]}</h2>

          {worn ? (
            <div className="gear-detail" data-tier={worn.item.rarity}>
              <ItemFace entry={worn} worth={worth} />
              <p className="section-sub">{worn.item.blurb}</p>
              <SecondaryAction onClick={() => onUnequip(shelf.slot)}>Take it off</SecondaryAction>
            </div>
          ) : (
            <p className="section-sub">Nothing on this slot.</p>
          )}

          <h3 className="gear-sheet-sub">In the bag</h3>
          {others.length === 0 ? (
            <p className="section-sub">
              Nothing else for this slot. <Link to="/shop" onClick={onClose}>The Shop</Link> has more.
            </p>
          ) : (
            <ul className="gear-swap">
              {others.map((entry) => {
                const source = worth(entry.item);
                const delta = source ? source.statLevel - wornLevel : 0;
                return (
                  <li key={entry.row.id} className="gear-swap-row" data-tier={entry.item.rarity}>
                    <ItemFace entry={entry} worth={worth} />
                    {source && worn && delta !== 0 ? (
                      <span className="gear-swap-delta" data-up={delta > 0 || undefined}>
                        {delta > 0 ? `+${delta}` : `−${-delta}`}
                      </span>
                    ) : null}
                    {/* Locked gear stays pressable on purpose: `equipItem`
                        answers with the reason, which is more use than a dead
                        button. */}
                    <SecondaryAction onClick={() => onEquip(entry.item.id)}>
                      {entry.locked ? `Level ${entry.item.minLevel}` : 'Wear'}
                    </SecondaryAction>
                  </li>
                );
              })}
            </ul>
          )}

          <SecondaryAction onClick={onClose}>Done</SecondaryAction>
        </>
      ) : null}
    </Sheet>
  );
}

/** Art, name, tier and refine, and the number: one item, the same way twice. */
function ItemFace({ entry, worth }: { entry: OwnedGear; worth: Worth }) {
  const { item, row } = entry;
  const Art = gearArt(item.id);
  const source = worth(item);
  return (
    <div className="gear-face">
      <span className="asset-card-art">{Art ? <Art /> : null}</span>
      <span className="gear-face-text">
        <span className="asset-card-name">{item.name}</span>
        <span className="asset-card-meta">
          {RARITY_NAMES[item.rarity]}{row.refine > 0 ? ` +${row.refine}` : ''}
        </span>
        <span className="asset-card-stat">
          {/* Above its level an item gives nothing, and `gearSources` says so
              by leaving it out — the sheet counts it as nothing, and so does
              this line. */}
          {source ? worthLine(source) : `Gives nothing until level ${item.minLevel}`}
        </span>
      </span>
    </div>
  );
}
