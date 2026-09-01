import type { CoupleId, MemberId } from '../types';

/**
 * What it means for a device to change who it is.
 *
 * `ensureIdentity()` mints a provisional `memberId` and `coupleId` on the phone
 * that installs first, because the app has to work before there is a partner to
 * pair with. Pairing then replaces both with the ids the Worker issues — and
 * everything written in between kept the provisional pair, so it stopped being
 * anyone's: it never synced, and it never appeared in a "mine" view again.
 *
 * This module is the description of the repair: which fields on which tables
 * carry an id, which rows have to move rather than be updated in place, and
 * what happens when a row already exists where one is headed. It is
 * deliberately free of Dexie and of the DOM — the repository does the writing,
 * this decides what the writing is.
 */

export interface Identity {
  memberId: MemberId;
  coupleId: CoupleId;
}

/** A stored row seen only as a bag of fields. No table's own type appears here. */
export type RekeyRow = Record<string, unknown>;

export interface TableRekey {
  /** The Dexie table name. */
  table: string;
  /** The property holding the row's primary key. */
  primaryKey: string;
  /** Properties carrying a member id. */
  memberFields: readonly string[];
  /** Properties carrying a couple id. */
  coupleFields: readonly string[];
  /**
   * Tables the repository upserts on `[memberId+day]`, so a member has at most
   * one row per day. A re-key can carry a second one into an occupied day, and
   * two rows there would quietly break the writer that assumes `.first()` is
   * the row.
   */
  oneRowPerDay?: true;
}

/**
 * Every table keyed by member or couple.
 *
 * `pet` and `avatars` are the awkward ones: their primary key *is* an id being
 * re-keyed, so those rows cannot be updated in place — the old key has to be
 * deleted and the row written under the new one. `members` is that shape again,
 * its `id` being the member id itself.
 *
 * `quests` and `achievements` carry a coupleId but have never been written to,
 * and `settings` holds the identity rather than referring to it, so neither
 * belongs here. `workoutPhotos` is not in `db/database.ts` on this branch; when
 * it lands it wants a line here too.
 */
export const REKEY_TABLES: readonly TableRekey[] = [
  { table: 'members', primaryKey: 'id', memberFields: ['id'], coupleFields: ['coupleId'] },
  {
    table: 'moods',
    primaryKey: 'id',
    memberFields: ['memberId'],
    coupleFields: [],
    oneRowPerDay: true,
  },
  {
    table: 'exercises',
    primaryKey: 'id',
    memberFields: ['memberId'],
    coupleFields: [],
    oneRowPerDay: true,
  },
  {
    table: 'cycles',
    primaryKey: 'id',
    memberFields: ['memberId'],
    coupleFields: [],
    oneRowPerDay: true,
  },
  { table: 'work', primaryKey: 'id', memberFields: ['memberId'], coupleFields: [] },
  { table: 'tasks', primaryKey: 'id', memberFields: ['memberId'], coupleFields: ['coupleId'] },
  { table: 'avatars', primaryKey: 'memberId', memberFields: ['memberId'], coupleFields: ['coupleId'] },
  { table: 'pets', primaryKey: 'id', memberFields: ['memberId'], coupleFields: ['coupleId'] },
  { table: 'rewards', primaryKey: 'id', memberFields: ['memberId'], coupleFields: ['coupleId'] },
  { table: 'redemptions', primaryKey: 'id', memberFields: ['memberId'], coupleFields: ['coupleId'] },
  // `fromMemberId` is who sent a Good Vibe. Missing it would leave a grant from
  // this phone attributed to an id nobody has.
  {
    table: 'lifeEvents',
    primaryKey: 'id',
    memberFields: ['memberId', 'fromMemberId'],
    coupleFields: ['coupleId'],
  },
  { table: 'pet', primaryKey: 'coupleId', memberFields: [], coupleFields: ['coupleId'] },
  { table: 'messages', primaryKey: 'id', memberFields: ['memberId'], coupleFields: ['coupleId'] },
];

/** What the repository is asked to do with one row. */
export type RekeyAction =
  /** The primary key is untouched, so writing the row back is the whole of it. */
  | { verb: 'put'; table: string; row: RekeyRow }
  /** The primary key changed: delete the old key, then write the new row. */
  | { verb: 'move'; table: string; oldKey: unknown; row: RekeyRow }
  /** Something already sits where this row was headed; the newcomer goes. */
  | { verb: 'drop'; table: string; oldKey: unknown };

export function sameIdentity(a: Identity, b: Identity): boolean {
  return a.memberId === b.memberId && a.coupleId === b.coupleId;
}

/** True when an identity is complete enough to move rows onto or off. */
export function isUsableIdentity(id: Partial<Identity> | undefined | null): id is Identity {
  return Boolean(id && id.memberId && id.coupleId);
}

/** True when a re-key moves the primary key rather than only fields on the row. */
export function rehomes(plan: TableRekey): boolean {
  return plan.memberFields.includes(plan.primaryKey) || plan.coupleFields.includes(plan.primaryKey);
}

/** True when any of the row's id fields still names the identity being left. */
export function carriesIdentity(row: RekeyRow, plan: TableRekey, id: Identity): boolean {
  return (
    plan.memberFields.some((field) => row[field] === id.memberId) ||
    plan.coupleFields.some((field) => row[field] === id.coupleId)
  );
}

/**
 * The row as it should read under the new identity. A field already carrying
 * something else — the partner's id, after a re-pairing — is left alone.
 */
export function rekeyRow<T extends RekeyRow>(
  row: T,
  plan: TableRekey,
  from: Identity,
  to: Identity,
): T {
  const next: RekeyRow = { ...row };
  for (const field of plan.memberFields) {
    if (next[field] === from.memberId) next[field] = to.memberId;
  }
  for (const field of plan.coupleFields) {
    if (next[field] === from.coupleId) next[field] = to.coupleId;
  }
  return next as T;
}

/**
 * The space a row occupies once it lands, where landing on top of another row
 * would be a fault: a primary key it would now share, or a member's day that
 * already has an answer. `undefined` means it can simply join the others.
 */
export function slotOf(row: RekeyRow, plan: TableRekey): string | undefined {
  if (rehomes(plan)) return `key ${String(row[plan.primaryKey])}`;
  if (plan.oneRowPerDay) return `day ${String(row.memberId)} ${String(row.day)}`;
  return undefined;
}

/**
 * One table's worth of repair.
 *
 * `rows` is the whole table: the rows that never carried the old identity are
 * what decide the collisions, so they have to be seen even though nothing
 * happens to them.
 *
 * On a collision the row already under the new identity wins. It is either what
 * the server sent or what the two of you have done since pairing, and letting a
 * solo row from before overwrite that would throw away shared history to save a
 * private draft. The loser is deleted rather than left alone: a row still
 * wearing an identity nobody has is invisible for good, and leaving it only
 * means every later re-key has to consider it again.
 */
export function planRekey(
  plan: TableRekey,
  rows: readonly RekeyRow[],
  from: Identity,
  to: Identity,
): RekeyAction[] {
  if (sameIdentity(from, to)) return [];

  const moving = rows.filter((row) => carriesIdentity(row, plan, from));
  if (moving.length === 0) return [];

  const taken = new Set<string>();
  for (const row of rows) {
    if (carriesIdentity(row, plan, from)) continue;
    const slot = slotOf(row, plan);
    if (slot) taken.add(slot);
  }

  const actions: RekeyAction[] = [];
  // Keys an earlier action has already written into. A row given up later must
  // not be deleted by its old key if that key is now somebody else's landing
  // place: the row sitting there is the one that was just moved in, and
  // deleting it would lose both rows instead of the one being conceded.
  const written = new Set<unknown>();
  for (const row of moving) {
    const next = rekeyRow(row, plan, from, to);
    const slot = slotOf(next, plan);
    const oldKey = row[plan.primaryKey];

    if (slot && taken.has(slot)) {
      if (!written.has(oldKey)) actions.push({ verb: 'drop', table: plan.table, oldKey });
      continue;
    }
    if (slot) taken.add(slot);

    if (next[plan.primaryKey] === oldKey) {
      actions.push({ verb: 'put', table: plan.table, row: next });
    } else {
      actions.push({ verb: 'move', table: plan.table, oldKey, row: next });
    }
    written.add(next[plan.primaryKey]);
  }
  return actions;
}
