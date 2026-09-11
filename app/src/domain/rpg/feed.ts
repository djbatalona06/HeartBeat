import { authorOf } from './lifeEvents';
import type { Cheer, LifeEvent } from './types';

/**
 * The feed, and the one gesture on it.
 *
 * A cheer is "I saw that" attached to something the other person logged. It is
 * the only thing in this app that pays nothing, and that is on purpose:
 *
 * A payout would have to land on the *other* person's avatar, which is the
 * problem `db/repository/lifeEventSettle.ts` exists to solve for Good Vibes and
 * which there is no reason to create a second instance of.
 *
 * A payable reaction is also farmable in a way sending Good Vibes is not.
 * Vibes are capped per sender per day; cheers scale with the number of events,
 * and the number of events is something the couple controls. Capping them would
 * mean counting rows written on two phones against a shared limit, which is the
 * class of thing that goes quietly wrong.
 *
 * And it costs nothing to leave it free. "Grants never take" is a rule about
 * grants, not an obligation for every gesture to be one. In an app where
 * everything else is scored, one place to say "I saw that" without the game
 * marking it is worth having.
 *
 * Pure. The Dexie reads live in the panel; the repository write lives in
 * `db/repository/cheers.ts`.
 */

/**
 * A cheer's primary key, derived rather than minted.
 *
 * Two phones cheering the same event converge on one row instead of racing, and
 * a double tap is the same row rather than a second one. There is no un-cheer
 * to undo it with: holdings sync has no tombstone, so a row deleted locally is
 * resurrected by the next pull — `shouldApply` applies anything it has no local
 * copy of. The button adds, and that is all it does.
 */
export function cheerId(eventId: string, memberId: string): string {
  return `${eventId}:${memberId}`;
}

export function canCheer(
  event: LifeEvent,
  memberId: string,
): { ok: true } | { ok: false; reason: string } {
  if (authorOf(event) === memberId) {
    return { ok: false, reason: 'This one is yours. Cheers are for the other person.' };
  }
  return { ok: true };
}

export interface FeedItem {
  event: LifeEvent;
  /** Distinct members who cheered — see `buildFeed` for why this is not a count. */
  cheeredBy: string[];
  /** This device's member has already cheered it. */
  cheered: boolean;
  /** This device's member may cheer it at all. */
  cheerable: boolean;
}

/**
 * Newest first, with each event's cheers attached.
 *
 * `cheeredBy` counts distinct members, never rows, and that is a correctness
 * requirement rather than tidiness. A cheer's id embeds the member id, and
 * `rekeyRow` rewrites the *fields* named in `memberFields` — not the primary
 * key, because `cheers` does not rehome. So after a pairing changes someone's
 * id, a re-cheer of the same event mints a second row with a different derived
 * id, and one person would otherwise read as two.
 */
export function buildFeed(
  events: readonly LifeEvent[],
  cheers: readonly Cheer[],
  memberId: string,
  limit?: number,
): FeedItem[] {
  const byEvent = new Map<string, Set<string>>();
  for (const cheer of cheers) {
    const seen = byEvent.get(cheer.eventId) ?? new Set<string>();
    seen.add(cheer.memberId);
    byEvent.set(cheer.eventId, seen);
  }

  const ordered = [...events].sort((a, b) => b.grantedAt - a.grantedAt);
  const shown = limit === undefined ? ordered : ordered.slice(0, limit);

  return shown.map((event) => {
    const cheeredBy = [...(byEvent.get(event.id) ?? [])];
    return {
      event,
      cheeredBy,
      cheered: cheeredBy.includes(memberId),
      cheerable: canCheer(event, memberId).ok,
    };
  });
}
