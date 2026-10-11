/**
 * Whose cycle a screen is showing, and whether the other person logs one.
 *
 * Pure, and the only place either question is answered. Three screens used to
 * answer them three ways: the cycle page guessed "whoever else has rows", the
 * wellness note and the support page read `Member.tracksCycle` off the
 * partner's row, and that field is never served by the server, so on the other
 * phone it was always false and the partner's lane never opened.
 *
 * What does cross the wire is the cycle rows themselves, keyed by member. So
 * "my partner logs one" is read from those, and from the one answer a person
 * does give on their own phone: choosing "My partner's" says it outright.
 */

export type CycleViewing = 'me' | 'partner';

export interface CycleFacts {
  /** This phone's member, or null until identity has resolved. */
  myId: string | null;
  /** `Settings.tracksCycle`: true is "I log", false is "my partner does", undefined is not asked yet. */
  tracksCycle: boolean | undefined;
  /** The other member of *this* couple, or null on a lone phone. */
  partnerId: string | null;
  /** Every member id that has at least one cycle row on this phone. */
  rowOwners: readonly string[];
}

/** Whether the partner has written a cycle row, which is what actually syncs. */
export function partnerLogsCycle({ partnerId, rowOwners }: Pick<CycleFacts, 'partnerId' | 'rowOwners'>): boolean {
  return partnerId !== null && rowOwners.includes(partnerId);
}

/**
 * Whether the other person's cycle is one this phone can read about.
 *
 * True when they have logged, or when this person said the page is their
 * partner's. Never true on a lone phone: there is nobody to log it.
 */
export function partnerTracksCycle(facts: Pick<CycleFacts, 'tracksCycle' | 'partnerId' | 'rowOwners'>): boolean {
  if (facts.partnerId === null) return false;
  return partnerLogsCycle(facts) || facts.tracksCycle === false;
}

/**
 * The member whose rows the cycle page draws, or null for "nothing to draw yet".
 *
 * Null while identity or the answer is still loading, rather than a guess: with
 * no `myId`, every row looks like somebody else's and the page used to show the
 * viewer's own cycle as their partner's for a frame.
 *
 * `viewing` only matters when both of you log. Asking to see a partner who has
 * no rows, or yourself when you do not log, falls back to the default.
 */
export function cycleSubject(facts: CycleFacts, viewing: CycleViewing = 'me'): string | null {
  const { myId, tracksCycle, partnerId } = facts;
  if (myId === null || tracksCycle === undefined) return null;

  const theirs = partnerLogsCycle(facts) ? partnerId : null;
  if (tracksCycle) return viewing === 'partner' && theirs !== null ? theirs : myId;
  return theirs;
}

/** Both of you log: the only time there is a choice of whose to read. */
export function canChooseViewing(facts: CycleFacts): boolean {
  return facts.myId !== null && facts.tracksCycle === true && partnerLogsCycle(facts);
}

/** The other member of this couple, from the members this phone holds. Null on a lone phone. */
export function partnerIdOf(
  members: readonly { id: string; coupleId: string; revokedAt?: number }[],
  myId: string | null,
  coupleId: string | undefined,
): string | null {
  if (myId === null || !coupleId) return null;
  // The couple is checked here and not only in the query: a live query keeps
  // its last answer while its key changes, so a stale couple's members can
  // still be in hand for a frame after the couple does change.
  const other = members.find((m) => m.coupleId === coupleId && m.id !== myId && m.revokedAt === undefined);
  return other?.id ?? null;
}
