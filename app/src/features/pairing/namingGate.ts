/**
 * Whether to show the screen that introduces the two of you to each other by
 * name, and what it says about the specific person on the other side.
 *
 * `usePairing`'s `paired` is true the moment *this* device holds a token —
 * which, for the phone that started the pairing, is before anybody has
 * joined at all (`isPaired`'s own note calls this out: `pairStart` mints a
 * real token for a couple of one). This gate cares about a stronger fact —
 * whether a second member row actually exists — so the phone still waiting
 * for its partner never sees a naming screen for a partner who is not there
 * yet. It fires once, on whichever device is the one to discover a real
 * partner while it still has no name of its own, and never again once either
 * a name is set or the screen has been dismissed.
 *
 * Kept DOM-free so vitest can reach it — see vitest.config.ts, which only
 * collects .ts.
 */

import type { Member } from '../../domain/types';

export interface NamingGateState {
  /** From `isPaired(settings)` — this device holds a token. */
  paired: boolean;
  /** `partnerOf(...) !== undefined`. A partner, not a token, makes a pairing real. */
  hasPartner: boolean;
  /** This device's own `Member.displayName`, if any. */
  myName: string | undefined;
  /** `settings.namingGateSeen === true`. */
  seen: boolean;
}

export function showNamingGate(state: NamingGateState): boolean {
  return state.paired && state.hasPartner && !hasName(state.myName) && !state.seen;
}

/**
 * The other person in *this* couple, if their row has arrived.
 *
 * The one definition of "linked" — counting rows is not it, because a row can
 * outlive the couple it came from (an earlier pairing, a re-key) and would
 * pass for a partner who is not there.
 */
export function partnerOf(
  members: readonly Member[] | undefined,
  me: { coupleId?: string; memberId?: string } | undefined,
): Member | undefined {
  if (!me?.coupleId || !me.memberId) return undefined;
  // A member who has left or been removed keeps their row, but is not a partner.
  return members?.find((m) => m.coupleId === me.coupleId && m.id !== me.memberId && !m.revokedAt);
}

/** The person who was here and is not any more — for "Sam left", not "linked". */
export function formerPartnerOf(
  members: readonly Member[] | undefined,
  me: { coupleId?: string; memberId?: string } | undefined,
): Member | undefined {
  if (!me?.coupleId || !me.memberId) return undefined;
  return members?.find((m) => m.coupleId === me.coupleId && m.id !== me.memberId && m.revokedAt);
}

/**
 * How often to ask the server about the other person, or `null` when unpaired.
 *
 * Nothing else ever reads the members table after pairing — sync, holdings
 * and the pet all skip it — so this is the only way a phone learns two things:
 *
 *   - that its partner arrived at all. The phone that *started* holds a token
 *     before anybody joins and has no other way to hear the code was used, so
 *     it asks briskly;
 *   - that its partner picked a name. The screen promises it "will show up
 *     here the moment they do", but they may skip naming for good, so this
 *     asks gently until a name lands;
 *   - that they are still there, or that this phone is still wanted, which it
 *     asks about once a minute for as long as the pairing lasts.
 *
 * Only ever run while the app is on screen (see `useNamingGate`).
 */
export function partnerPollMs(paired: boolean, partner: Member | undefined): number | null {
  if (!paired) return null;
  if (!partner) return PARTNER_POLL_MS;
  // Never null once linked: a partner who leaves, or a removal of this phone,
  // is only ever learned by asking, so the ask slows down but does not stop.
  return hasName(partner.displayName) ? PARTNER_WATCH_POLL_MS : PARTNER_NAME_POLL_MS;
}

export const PARTNER_POLL_MS = 5000;
export const PARTNER_NAME_POLL_MS = 30000;
export const PARTNER_WATCH_POLL_MS = 60000;

function hasName(name: string | undefined): boolean {
  return Boolean(name && name.trim().length > 0);
}

/**
 * Names the specific person you're now linked with, or says why it can't yet.
 *
 * Never guesses at a placeholder like "your partner" as the headline fact —
 * the whole point of the message is that it names them, and a couple sharing
 * one pet and one calendar deserves to be told who, not just that.
 */
export function partnerLinkMessage(partnerName: string | undefined): string {
  const name = partnerName?.trim();
  return name
    ? `You’re linked with ${name}.`
    : 'You’re linked. They haven’t picked a name yet — it will show up here the moment they do.';
}
