/**
 * Leaving, removing, and inviting into a free seat — the three things a
 * pairing can do after it has begun.
 *
 * Each stitches one server call to the local change that has to follow it, in
 * the order that keeps a failure harmless: the server first, because a phone
 * that resets locally and then fails to tell the server has walked away from a
 * seat nobody can refill, and the reset only after the server agreed.
 */
import { db, loadSettings, saveSettings } from '../../db/database';
import { resetToSolo, saveMembersFromServer } from '../../db/repository';
import { fetchProfiles, isUnlinked, pairInvite, pairLeave, revokeMember } from '../../pwa/api';
import type { Member } from '../../domain/types';
import { partnerOf } from './namingGate';

/** Whoever else has a row in this couple — the partner, or the one who left. */
export function otherMemberId(
  members: readonly Member[],
  me: { coupleId?: string; memberId?: string },
): string | undefined {
  return members.find((m) => m.coupleId === me.coupleId && m.id !== me.memberId)?.id;
}

/**
 * Leave, keeping everything that is yours. Throws if the server cannot be
 * reached, so the seat is never left held by somebody who has gone.
 *
 * A phone that was removed has no seat to free and its token is already
 * refused, so it skips the call and just resets — this is also "keep my data
 * and start over".
 */
export async function leaveCouple(): Promise<void> {
  const settings = await loadSettings();
  if (settings.workerSecret && !settings.unlinkedAt) {
    try {
      await pairLeave(settings.workerSecret);
    } catch (e) {
      // Already refused means already out: nothing to free, carry on.
      if (!isUnlinked(e)) throw e;
    }
  }
  await resetToSolo(otherMemberId(await db.members.toArray(), settings));
}

/** Take the partner out. They find out the next time their phone asks. */
export async function removePartner(): Promise<void> {
  const settings = await loadSettings();
  const partner = partnerOf(await db.members.toArray(), settings);
  if (!settings.workerSecret || !partner) return;
  await revokeMember(settings.workerSecret, partner.id);
  await saveMembersFromServer(await fetchProfiles(settings.workerSecret));
}

/** A fresh code for the free seat, kept the way `start` keeps its own. */
export async function inviteToFreeSeat(): Promise<{ invite: string; expiresAt: number }> {
  const { workerSecret } = await loadSettings();
  if (!workerSecret) throw new Error('not paired');
  const issued = await pairInvite(workerSecret);
  await saveSettings({ pendingInvite: issued.invite, pendingInviteExpiresAt: issued.expiresAt });
  return issued;
}
