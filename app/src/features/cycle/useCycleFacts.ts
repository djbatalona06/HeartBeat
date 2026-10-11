import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import type { Settings } from '../../domain/types';
import { partnerIdOf, type CycleFacts } from '../../domain/cycle/subject';

/**
 * What the cycle screens need to know about who logs, read from what is on this
 * phone: the couple's members and who has written cycle rows. Components hand
 * these to `domain/cycle/subject.ts`, which decides.
 *
 * Both reads are live, so a partner's first log arriving by sync changes the
 * answer without a reload.
 */
export function useCycleFacts(settings: Settings | undefined, myId: string | null): CycleFacts {
  const coupleId = settings?.coupleId;

  const members = useLiveQuery(
    async () => (coupleId ? db.members.where('coupleId').equals(coupleId).toArray() : []),
    [coupleId],
  );
  // Distinct member ids with any cycle row. The `memberId` index makes this a
  // key scan, not a read of every entry.
  const owners = useLiveQuery(async () => (await db.cycles.orderBy('memberId').uniqueKeys()).map(String), []);

  return {
    myId,
    tracksCycle: settings?.tracksCycle,
    partnerId: partnerIdOf(members ?? [], myId, coupleId),
    rowOwners: owners ?? [],
  };
}
