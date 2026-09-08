/**
 * The shared pet's half of sync.
 *
 * It is deliberately not part of `sync.ts`. That client is built on
 * last-write-wins, which is right for a row that is one person's account of one
 * of their own days — the two halves of the couple are not editing the same
 * row, so the conflicts it cannot resolve are the ones that do not happen.
 *
 * The pet is the opposite: one row, both partners, and a field that is
 * additive. Pushing a whole pet row would mean one phone's total overwriting
 * the other's, so what travels is not the total but the gains — each with an
 * id, so a retry after a lost response is not a second payment — and the server
 * adds them up.
 *
 * Nothing here can lower the local bar. The couple's pet only ever rises.
 */

import { db, loadSettings } from '../db/database';
import { seedLegacyPetXp, settlePetXp, type PetXpNumbers } from '../db/repository';
import { MAX_AWARD_XP, MAX_AWARD_ID, type Pet, type PetXpAward } from '../domain/types';

/** Matches MAX_AWARDS in functions/api/pet.ts. */
export const FLUSH_CHUNK = 50;

export { MAX_AWARD_XP, MAX_AWARD_ID } from '../domain/types';

export type { PetXpNumbers };

export interface PetXpFlush extends PetXpNumbers {
  /** How many awards this round handed over. */
  pushed: number;
}

/**
 * Fold the server's answer into the local row.
 *
 * Three rules, all of them one-way:
 *
 *   - `sharedXp` is the couple total, and takes the higher of what we knew and
 *     what came back. A stale or reordered answer cannot roll it back.
 *   - `xp` is what the bar shows, and takes the higher of itself and the shared
 *     total. It therefore covers both the gains this phone has made but not yet
 *     handed over, and the ones the other phone made while this one was in a
 *     pocket — and it never falls, which is the whole ruling.
 *   - `pendingXp` drops exactly the awards the server said it has on record.
 *     Anything it did not name stays queued for the next flush.
 */
export function mergePetXp(
  pet: Pick<Pet, 'xp' | 'sharedXp' | 'pendingXp'> | undefined,
  serverXp: number,
  settled: string[],
): PetXpNumbers {
  const done = new Set(settled);
  const sharedXp = Math.max(pet?.sharedXp ?? 0, Number.isFinite(serverXp) ? serverXp : 0);
  return {
    sharedXp,
    xp: Math.max(pet?.xp ?? 0, sharedXp),
    pendingXp: (pet?.pendingXp ?? []).filter((a) => !done.has(a.id)),
  };
}

interface PetPayload {
  xp?: number;
  settled?: string[];
}

/**
 * The endpoint's own rules, restated so a refusal can be pinned on an award.
 *
 * An award the server will not take is not a network problem: it will be
 * refused again tomorrow, and because the queue is drained in order it would
 * sit at the front of it forever, keeping every gain behind it from ever
 * reaching the shared total. Recognising the bad one is what lets it be
 * dropped and the rest go through.
 */
function sendable(award: PetXpAward): boolean {
  const id = typeof award.id === 'string' ? award.id.trim() : '';
  return id.length > 0 && award.id.length <= MAX_AWARD_ID
    && Number.isInteger(award.amount) && award.amount >= 0 && award.amount <= MAX_AWARD_XP;
}

/** A refusal, carrying the status so the caller can tell it from a dead network. */
class PetSyncError extends Error {
  constructor(readonly status: number) {
    super(`pet xp sync failed: ${status}`);
    this.name = 'PetSyncError';
  }
}

async function ask(token: string, awards: PetXpAward[]): Promise<PetPayload> {
  const headers: HeadersInit = { authorization: `Bearer ${token}` };
  // Nothing to hand over is still worth a round trip: it is how this phone
  // learns what the other one earned.
  const response = awards.length === 0
    ? await fetch('/api/pet', { headers })
    : await fetch('/api/pet', {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        awards: awards.map((a) => ({ id: a.id, amount: a.amount })),
      }),
    });
  if (!response.ok) throw new PetSyncError(response.status);
  return (await response.json()) as PetPayload;
}

/**
 * One round trip for the pet.
 *
 * Returns null when the device is not paired yet, which is not an error — it is
 * the state every device starts in, and the queue simply waits. It is safe to
 * lose: the awards are in IndexedDB, and the next launch, foreground or
 * reconnection sends them.
 */
export async function flushPetXp(): Promise<PetXpFlush | null> {
  const settings = await loadSettings();
  const token = settings.workerSecret;
  const coupleId = settings.coupleId;
  if (!token || !coupleId) return null;

  // An install that predates the shared pet has a local total the server has
  // never heard of. Told once, before anything else is collected, so the very
  // first flush carries the couple's whole history rather than starting them
  // both from nothing.
  if (settings.memberId) await seedLegacyPetXp(coupleId, settings.memberId);

  const pet = await db.pet.get(coupleId);
  // One page at a time. A phone back from a long time away drains over several
  // rounds rather than posting a request the server would refuse whole.
  const awards = (pet?.pendingXp ?? []).slice(0, FLUSH_CHUNK);

  let payload: PetPayload;
  try {
    payload = await ask(token, awards);
  } catch (err) {
    // A 400 is the endpoint saying one of these awards is not one it will ever
    // take. Retrying it forever would wedge the queue, so the offender is
    // dropped — its XP is already in the local bar, so what is lost is that one
    // award's share of the couple total, not the pet. Anything else is a
    // network or a server having a bad minute: the queue keeps its place.
    if (err instanceof PetSyncError && err.status === 400 && awards.some((a) => !sendable(a))) {
      const bad = new Set(awards.filter((a) => !sendable(a)).map((a) => a.id));
      await settlePetXp(coupleId, (fresh) => ({
        xp: fresh?.xp ?? 0,
        sharedXp: fresh?.sharedXp ?? 0,
        pendingXp: (fresh?.pendingXp ?? []).filter((a) => !bad.has(a.id)),
      }));
    }
    throw err;
  }

  // Merged against the row as it is when the answer lands, not the one this
  // round trip started from: a gain made while the request was in the air is
  // in the row by now, and the merge must not write it back out.
  const next = await settlePetXp(
    coupleId,
    (fresh) => mergePetXp(fresh, payload.xp ?? 0, payload.settled ?? []),
  );
  return { ...next, pushed: awards.length };
}
