import { db } from '../database';
import type { DayKey, MemberId } from '../../domain/types';
import { isWritten, type Reflection } from '../../domain/selfcare/reflections';
import { id, now } from './shared';

/* -- reflections -------------------------------------------------------------
 * The journal. Private by default — see the note in
 * `domain/selfcare/reflections.ts` for why that is a decision rather than an
 * oversight in an app otherwise built for two people to read each other's day.
 */

/** This member's entries. Ordering is the caller's — `byNewest` is pure. */
export async function reflectionsFor(memberId: MemberId): Promise<Reflection[]> {
  return db.reflections.where('memberId').equals(memberId).toArray();
}

export async function reflectionsOn(memberId: MemberId, day: DayKey): Promise<Reflection[]> {
  return db.reflections.where('[memberId+day]').equals([memberId, day]).toArray();
}

/**
 * Write one.
 *
 * Refuses an empty body rather than storing a blank row: the save button is
 * live while the textarea has whitespace in it, and a journal that fills up
 * with empty days is one nobody scrolls.
 *
 * The prompt text is stored alongside its id, so rewording a prompt later
 * cannot change what an old entry appears to be answering.
 */
export async function addReflection(fields: {
  memberId: MemberId;
  coupleId: string;
  day: DayKey;
  body: string;
  promptId?: string;
  prompt?: string;
  shared?: boolean;
}): Promise<string | null> {
  if (!isWritten(fields.body)) return null;
  const row: Reflection = {
    id: id(),
    coupleId: fields.coupleId,
    memberId: fields.memberId,
    day: fields.day,
    promptId: fields.promptId,
    prompt: fields.prompt,
    body: fields.body.trim(),
    shared: fields.shared,
    createdAt: now(),
    updatedAt: now(),
  };
  await db.reflections.put(row);
  return row.id;
}

/** Edit the text of one. Never moves it to today — an entry keeps its day. */
export async function editReflection(reflectionId: string, body: string): Promise<boolean> {
  if (!isWritten(body)) return false;
  const existing = await db.reflections.get(reflectionId);
  if (!existing) return false;
  await db.reflections.put({ ...existing, body: body.trim(), updatedAt: now() });
  return true;
}

/**
 * Share one with the other half of the couple, or take it back.
 *
 * A separate call from writing, and deliberately so: sharing is the explicit
 * act, and an edit must never quietly change who can see something.
 */
export async function shareReflection(reflectionId: string, shared: boolean): Promise<void> {
  const existing = await db.reflections.get(reflectionId);
  if (!existing) return;
  await db.reflections.put({ ...existing, shared, updatedAt: now() });
}

/**
 * Delete one, for real.
 *
 * The one thing in this app that hard-deletes rather than archiving. Tasks are
 * archived because their history is the point; a journal entry somebody wants
 * gone is a journal entry that has to actually go, or the feature is not
 * trustworthy enough to write in honestly.
 */
export async function deleteReflection(reflectionId: string): Promise<void> {
  await db.reflections.delete(reflectionId);
}

/** What the partner has chosen to share. Never returns an unshared row. */
export async function sharedReflections(coupleId: string, exceptMemberId: MemberId): Promise<Reflection[]> {
  const rows = await db.reflections.where('coupleId').equals(coupleId).toArray();
  return rows.filter((r) => r.shared && r.memberId !== exceptMemberId);
}
