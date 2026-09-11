import { db } from '../database';
import { grantFor } from '../../domain/rpg/lifeEvents';
import { applyPayout } from '../../domain/rpg/avatar';
import type { MemberId } from '../../domain/types';
import { getOrCreateAvatar } from './rpg';
import { now } from './shared';

/**
 * Paying a grant that was written on the other phone.
 *
 * A Good Vibe is the one grant you cannot give yourself, which means the row is
 * always written by the person who is *not* being paid. `grantLifeEvent` runs
 * on the sender's device, where the recipient's avatar exists only as a hollow
 * copy that `collectPending` never pushes and `shouldApply` never accepts — so
 * paying it there spent the energy into a row nobody reads. Before life events
 * synced at all nobody noticed. A feed that says "they sent you good vibes"
 * makes it a visible lie.
 *
 * So the recipient's device pays it, once the row has arrived. This runs after
 * `syncHoldings()` for that reason: the events have to be here first.
 *
 * The shape is the one `petXp.ts` argues for — an idempotent, gain-only award
 * against a recorded id — with the ledger in its own local table rather than a
 * ring buffer on a row. A ring can forget, and forgetting here means paying a
 * three-week-old vibe a second time.
 */
export interface SettleResult {
  settled: number;
}

export async function settleLifeEvents(
  memberId: MemberId,
  coupleId: string,
): Promise<SettleResult> {
  // Only grants addressed to us, and only ones somebody else wrote. A
  // self-granted hard day was already paid by `grantLifeEvent` on this phone.
  const mine = await db.lifeEvents.where('memberId').equals(memberId).toArray();
  const owed = mine.filter((event) => event.fromMemberId && event.fromMemberId !== memberId);
  if (!owed.length) return { settled: 0 };

  return db.transaction('rw', db.avatars, db.lifeEventSettlements, async () => {
    // Read the ledger inside the transaction, so two sync passes racing each
    // other cannot both decide the same event is unpaid.
    const settledIds = new Set(
      (await db.lifeEventSettlements.bulkGet(owed.map((e) => e.id)))
        .filter((row): row is NonNullable<typeof row> => !!row)
        .map((row) => row.eventId),
    );
    const due = owed.filter((event) => !settledIds.has(event.id));
    if (!due.length) return { settled: 0 };

    const at = now();
    let avatar = await getOrCreateAvatar(memberId, coupleId);
    for (const event of due) {
      avatar = applyPayout(avatar, grantFor(event.kind), at);
    }
    await db.avatars.put(avatar);
    await db.lifeEventSettlements.bulkPut(
      due.map((event) => ({ eventId: event.id, settledAt: at })),
    );
    return { settled: due.length };
  });
}
