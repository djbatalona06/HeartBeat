import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ensureIdentity, equipItem, getOrCreateAvatar, holdingsOf, setCompanion, unequipSlot,
} from '../../db/repository';
import { levelOf } from '../../domain/rpg/avatar';
import { RARITY_NAMES, SLOT_NAMES } from '../../domain/rpg/gear';
import { petKindById, petSheet } from '../../domain/rpg/pets';
import {
  finishedTodos, gearShelves, keptUp, ownedPets, summarize,
  type GearShelf, type OwnedGear, type OwnedPet,
} from '../../domain/rpg/holdings';
import { gearArt } from '../party/art/gear';
import { petArt } from '../party/art/pets';

/**
 * The bag: everything this member owns, in one place.
 *
 * It exists because the app already knew all of this and had nowhere to say
 * it. Owned gear was visible only as a "bought" flag inside the *shop*, so the
 * only way to see what you had was to scroll a price list. Companions were a
 * row on the Party page beside a boss fight. And a finished to-do set
 * `done: true`, got archived, and vanished from the one screen that had ever
 * shown it — so the app quietly threw away the record of everything anyone had
 * actually completed.
 *
 * Party keeps the fight and the shop; this keeps the holdings. The split is
 * "what am I doing" against "what do I have", and every write here goes to the
 * same repository call Party already used, so there is exactly one code path
 * that can equip an item.
 */

/** How long a confirmation stays up. Matches Party's own toast. */
const MESSAGE_MS = 4200;

function dateOf(at: number): string {
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function AssetsPage() {
  const [identity, setIdentity] = useState<{ memberId: string; coupleId: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // The avatar has to exist before the shelves can know what level gates what.
  useEffect(() => {
    let live = true;
    ensureIdentity().then(async (next) => {
      await getOrCreateAvatar(next.memberId, next.coupleId);
      if (live) setIdentity(next);
    }).catch(() => {});
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [message]);

  // One live query over all four tables rather than four. Dexie observes every
  // table the callback reads, so this stays reactive to a purchase, an equip
  // and a completed task alike — without the intermediate renders where the
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
  const shelves = gearShelves(holdings.gear, avatar.gear, level);
  const companions = ownedPets(holdings.pets, avatar.companionId);
  const finished = finishedTodos(holdings.tasks);
  const streaks = keptUp(holdings.tasks);
  const totals = summarize(shelves, companions, finished, streaks);

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">Bag</h1>
        <p className="page-sub">
          Everything you own, and everything you have finished.
        </p>
      </header>

      <section className="panel">
        <div className="asset-totals">
          <Total value={avatar.coins} label={avatar.coins === 1 ? 'coin' : 'coins'} />
          <Total value={totals.gearCount} label="gear" sub={`${totals.wornCount} worn`} />
          <Total value={totals.petCount} label={totals.petCount === 1 ? 'companion' : 'companions'} />
          <Total value={totals.finishedCount} label="finished" />
        </div>
        <p className="section-sub asset-shop-note">
          New gear and eggs are bought on <Link to="/party">Party</Link>.
        </p>
      </section>

      {message ? <p className="asset-message" role="status">{message}</p> : null}

      <section className="panel">
        <h2 className="section-title">Gear</h2>
        <p className="section-sub">
          One slot at a time. Tap something to put it on; tap what is on to take it off.
        </p>
        {totals.gearCount === 0 ? (
          <p className="empty">
            Nothing yet. The shop on <Link to="/party">Party</Link> is where the first one comes from.
          </p>
        ) : (
          shelves.map((shelf) => (
            <Shelf
              key={shelf.slot}
              shelf={shelf}
              onEquip={async (itemId) => {
                const result = await equipItem(identity.memberId, identity.coupleId, itemId);
                if (result && !result.ok) setMessage(result.reason ?? 'That would not go on.');
              }}
              onUnequip={async (slot) => {
                await unequipSlot(identity.memberId, identity.coupleId, slot);
              }}
            />
          ))
        )}
      </section>

      <section className="panel">
        <h2 className="section-title">Companions</h2>
        <p className="section-sub">
          One walks with you at a time. The rest keep their bond while they wait.
        </p>
        {companions.length === 0 ? (
          <p className="empty">
            No eggs hatched yet. They come from the shop on <Link to="/party">Party</Link>.
          </p>
        ) : (
          <ul className="asset-pets">
            {companions.map((entry) => (
              <PetRow
                key={entry.pet.id}
                entry={entry}
                onChoose={() => setCompanion(identity.memberId, identity.coupleId, entry.pet.id)}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2 className="section-title">Finished</h2>
        <p className="section-sub">
          To-dos you have closed. They used to disappear the moment they were ticked.
        </p>
        {finished.length === 0 ? (
          <p className="empty">Nothing closed yet.</p>
        ) : (
          <ul className="asset-done">
            {finished.map(({ task, finishedAt }) => (
              <li key={task.id} className="asset-done-row">
                <span className="asset-done-title">{task.title}</span>
                <span className="asset-done-when">{dateOf(finishedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {streaks.length > 0 ? (
        <section className="panel">
          <h2 className="section-title">Kept up</h2>
          <p className="section-sub">
            Running streaks. These are not finished — that is rather the point of them.
          </p>
          <ul className="asset-done">
            {streaks.map(({ task, streak }) => (
              <li key={task.id} className="asset-done-row">
                <span className="asset-done-title">{task.title}</span>
                <span className="asset-streak">{streak} in a row</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
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

interface ShelfProps {
  shelf: GearShelf;
  onEquip: (itemId: string) => void;
  onUnequip: (slot: GearShelf['slot']) => void;
}

function Shelf({ shelf, onEquip, onUnequip }: ShelfProps) {
  return (
    <div className="asset-shelf">
      <h3 className="asset-shelf-name">{SLOT_NAMES[shelf.slot]}</h3>
      {shelf.owned.length === 0 ? (
        <p className="asset-shelf-empty">Empty.</p>
      ) : (
        <ul className="asset-grid">
          {shelf.owned.map((entry) => (
            <GearCard
              key={entry.row.id}
              entry={entry}
              onToggle={() => (entry.worn ? onUnequip(shelf.slot) : onEquip(entry.item.id))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function GearCard({ entry, onToggle }: { entry: OwnedGear; onToggle: () => void }) {
  const { item, row, worn, locked } = entry;
  const Art = gearArt(item.id);
  return (
    <li>
      <button
        type="button"
        className="asset-card"
        data-worn={worn ? 'true' : undefined}
        data-locked={locked ? 'true' : undefined}
        onClick={onToggle}
        // Locked gear stays pressable on purpose: `equipItem` answers with the
        // reason, which is more use than a dead button.
        aria-pressed={worn}
      >
        <span className="asset-card-art">{Art ? <Art /> : null}</span>
        <span className="asset-card-name">{item.name}</span>
        <span className="asset-card-meta">
          {RARITY_NAMES[item.rarity]}
          {row.refine > 0 ? ` +${row.refine}` : ''}
        </span>
        {worn ? <span className="asset-card-flag">Worn</span> : null}
        {locked && !worn ? (
          <span className="asset-card-flag asset-card-flag-locked">Level {item.minLevel}</span>
        ) : null}
      </button>
    </li>
  );
}

function PetRow({ entry, onChoose }: { entry: OwnedPet; onChoose: () => void }) {
  const kind = petKindById(entry.pet.kindId);
  if (!kind) return null; // A kind retired between releases; see `ownedInSlot`.
  const sheet = petSheet(entry.pet);
  const Art = petArt(entry.pet.kindId);
  return (
    <li>
      <button
        type="button"
        className="asset-pet"
        data-active={entry.active ? 'true' : undefined}
        onClick={onChoose}
        aria-pressed={entry.active}
      >
        <span className="asset-pet-art">{Art ? <Art /> : null}</span>
        <span className="asset-pet-text">
          <span className="asset-pet-name">{kind.name}</span>
          <span className="asset-pet-meta">
            Rank {sheet.rank} · {sheet.bond} bond
            {sheet.toNextRank === null ? '' : ` · ${sheet.toNextRank} to go`}
          </span>
        </span>
        {entry.active ? <span className="asset-card-flag">Walking with you</span> : null}
      </button>
    </li>
  );
}
