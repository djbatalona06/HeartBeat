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

export interface NamingGateState {
  /** From `isPaired(settings)` — this device holds a token. */
  paired: boolean;
  /** `db.members.count()`. Two, not one, is what makes a pairing real. */
  memberCount: number;
  /** This device's own `Member.displayName`, if any. */
  myName: string | undefined;
  /** `settings.namingGateSeen === true`. */
  seen: boolean;
}

export function showNamingGate(state: NamingGateState): boolean {
  return state.paired && state.memberCount >= 2 && !hasName(state.myName) && !state.seen;
}

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
