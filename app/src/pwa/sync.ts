/**
 * The sync client.
 *
 * Every screen renders from IndexedDB and never waits on the network. This is
 * the one thing that reconciles that local record with the other phone's: push
 * what changed here, pull what changed there, and let the newer edit win.
 *
 * Last-write-wins is right for this data because a row is one person's account
 * of one of their own days — the two halves of the couple are not editing the
 * same row, so the conflicts this cannot resolve are the ones that do not
 * happen. (The boss fight is the exception, and lives on the server for exactly
 * that reason.)
 *
 * The winner is decided by the row's own `updatedAt`, on both sides, so the
 * result does not depend on which phone reached the network first.
 */

import { db, loadSettings, saveSettings } from '../db/database';
import type {
  CycleEntry, DayKey, ExerciseEntry, MemberId, MoodEntry, WorkEvent,
} from '../domain/types';

export const KINDS = ['mood', 'exercise', 'cycle', 'work'] as const;
export type EntryKind = (typeof KINDS)[number];

/** Matches MAX_WRITE in functions/api/entries.ts. */
const PUSH_CHUNK = 200;

export interface WireEntry {
  id: string;
  kind: EntryKind;
  day: DayKey;
  payload: unknown;
  updatedAt: number;
}

export interface PulledEntry extends WireEntry {
  memberId: MemberId;
  mine: boolean;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  applied: number;
  /** True when the server had more than one page left. */
  more: boolean;
}

/**
 * Does an incoming row replace what is held locally?
 *
 * Strictly newer, never equal: a re-delivered row with the same timestamp is
 * the same row, and rewriting it would only churn the watermark.
 */
export function wins(incoming: { updatedAt: number }, existing?: { updatedAt: number }): boolean {
  return !existing || incoming.updatedAt > existing.updatedAt;
}

/**
 * A calendar day travels as one row whose payload is that day's events, because
 * the server's unique index is (member, kind, day). Keeping the local shape as
 * one row per event and grouping only at this boundary means moving one
 * appointment never rewrites an array.
 */
export function groupWork(events: WorkEvent[]): Map<DayKey, WorkEvent[]> {
  const byDay = new Map<DayKey, WorkEvent[]>();
  for (const e of events) {
    const list = byDay.get(e.day);
    if (list) list.push(e);
    else byDay.set(e.day, [e]);
  }
  return byDay;
}

/** A work day's timestamp is its most recently touched event. */
export function workDayUpdatedAt(events: WorkEvent[]): number {
  return events.reduce((max, e) => Math.max(max, e.updatedAt), 0);
}

/** Everything this member has changed since the watermark, ready for the wire. */
export async function collectPending(memberId: MemberId, since: number): Promise<WireEntry[]> {
  const [moods, exercises, cycles, work] = await Promise.all([
    db.moods.where('memberId').equals(memberId).toArray(),
    db.exercises.where('memberId').equals(memberId).toArray(),
    db.cycles.where('memberId').equals(memberId).toArray(),
    db.work.where('memberId').equals(memberId).toArray(),
  ]);

  const out: WireEntry[] = [];
  const simple = (kind: EntryKind, rows: Array<MoodEntry | ExerciseEntry | CycleEntry>) => {
    for (const row of rows) {
      if (row.updatedAt <= since) continue;
      out.push({ id: row.id, kind, day: row.day, payload: row, updatedAt: row.updatedAt });
    }
  };
  simple('mood', moods);
  simple('exercise', exercises);
  simple('cycle', cycles);

  for (const [day, events] of groupWork(work)) {
    const updatedAt = workDayUpdatedAt(events);
    if (updatedAt <= since) continue;
    // Synthesised rather than borrowed from one of the events: the row stands
    // for the whole day, and the event whose id it borrowed could be deleted.
    out.push({ id: `${memberId}-work-${day}`, kind: 'work', day, payload: events, updatedAt });
  }

  return out.sort((a, b) => a.updatedAt - b.updatedAt);
}

/** Write one pulled row into the local record, if it is newer than what is here. */
async function applyEntry(entry: PulledEntry): Promise<boolean> {
  const { memberId, day, updatedAt } = entry;

  if (entry.kind === 'work') {
    const events = Array.isArray(entry.payload) ? (entry.payload as WorkEvent[]) : [];
    const existing = await db.work.where('[memberId+day]').equals([memberId, day]).toArray();
    if (existing.length && !wins(entry, { updatedAt: workDayUpdatedAt(existing) })) return false;
    // The day travels whole, so it lands whole: an event deleted on the other
    // phone is absent from the payload, and leaving the local copy behind would
    // resurrect it on every sync.
    await db.work.bulkDelete(existing.map((e) => e.id));
    await db.work.bulkPut(events.map((e) => ({ ...e, memberId, day })));
    return true;
  }

  const table = entry.kind === 'mood' ? db.moods : entry.kind === 'exercise' ? db.exercises : db.cycles;
  const existing = await table.where('[memberId+day]').equals([memberId, day]).first();
  if (!wins(entry, existing)) return false;
  const row = entry.payload as MoodEntry | ExerciseEntry | CycleEntry;
  // The server's copy of id/member/day is authoritative; the payload is only
  // trusted for the fields the local row does not key on.
  await table.put({ ...row, id: existing?.id ?? entry.id, memberId, day, updatedAt } as never);
  return true;
}

export async function applyPulled(entries: PulledEntry[]): Promise<number> {
  let applied = 0;
  for (const entry of entries) {
    if (await applyEntry(entry)) applied++;
  }
  return applied;
}

function authHeaders(token: string): HeadersInit {
  return { authorization: `Bearer ${token}` };
}

async function pushChunk(token: string, entries: WireEntry[]): Promise<void> {
  const res = await fetch('/api/entries', {
    method: 'POST',
    headers: { ...authHeaders(token), 'content-type': 'application/json' },
    body: JSON.stringify({ entries }),
  });
  if (!res.ok) throw new Error(`sync push failed: ${res.status}`);
}

async function pull(token: string, since: number): Promise<{
  entries: PulledEntry[];
  cursor: number;
  more: boolean;
}> {
  const res = await fetch(`/api/entries?since=${encodeURIComponent(String(since))}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(`sync pull failed: ${res.status}`);
  const body = (await res.json()) as {
    entries?: PulledEntry[];
    cursor?: number;
    more?: boolean;
  };
  return { entries: body.entries ?? [], cursor: body.cursor ?? since, more: !!body.more };
}

/**
 * One round trip. Returns null when the device is not paired yet, which is not
 * an error — it is the state every device starts in.
 */
export async function sync(): Promise<SyncResult | null> {
  const settings = await loadSettings();
  const token = settings.workerSecret;
  const memberId = settings.memberId;
  if (!token || !memberId) return null;

  const pushedAt = settings.syncPushedAt ?? 0;
  const pending = await collectPending(memberId, pushedAt);

  for (let i = 0; i < pending.length; i += PUSH_CHUNK) {
    await pushChunk(token, pending.slice(i, i + PUSH_CHUNK));
  }

  const { entries, cursor, more } = await pull(token, settings.syncPulledAt ?? 0);
  const applied = await applyPulled(entries);

  // Rows that arrived from the server are, by definition, already on it. Moving
  // the push watermark past them is what stops the next round sending them
  // straight back.
  const highWater = Math.max(
    pushedAt,
    ...pending.map((e) => e.updatedAt),
    ...entries.map((e) => e.updatedAt),
  );

  await saveSettings({ syncPushedAt: highWater, syncPulledAt: cursor });
  return { pushed: pending.length, pulled: entries.length, applied, more };
}
