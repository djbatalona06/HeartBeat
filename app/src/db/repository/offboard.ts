import { db, loadSettings, saveSettings } from '../database';
import { PERSONAL_TABLES, partnerKeys } from '../../domain/identity/offboard';
import type { RekeyRow } from '../../domain/identity/rekey';
import { forgetReportToken } from '../../pwa/crashReport';
import { rekeyIdentity } from './identity';
import { id, now } from './shared';

/**
 * Letting go of a couple, on this phone.
 *
 * The server half (freeing the seat, telling the other phone) is
 * `pwa/api.ts`'s `pairLeave` and happens first; this is what is left to do
 * locally, and it is the same whether this phone chose to leave or was told it
 * had been removed.
 *
 * Order is the point. The partner's rows go *before* the re-key: `rekeyIdentity`
 * carries every row wearing the old couple id to the new one, so a partner's
 * `members` row would come along and the phone would wake up linked to someone
 * who left. See domain/identity/offboard.ts.
 */

/**
 * Become a phone of one, keeping everything that is yours.
 *
 * Mints a fresh provisional identity, exactly as a first launch does, and
 * moves your own rows and the couple's shared ones (the pet, the quests) onto
 * it. `partnerId` is who to let go of; omit it when there is nobody to name.
 */
export async function resetToSolo(partnerId?: string): Promise<void> {
  const before = await loadSettings();

  if (partnerId) {
    const present = new Set(db.tables.map((table) => table.name));
    const plans = PERSONAL_TABLES.filter((plan) => present.has(plan.table));
    // Dexie only: nothing in here awaits anything else.
    await db.transaction('rw', plans.map((plan) => plan.table), async () => {
      for (const plan of plans) {
        const table = db.table<RekeyRow, unknown>(plan.table);
        // react-doctor-disable-next-line async-await-in-loop -- table by table inside one Dexie transaction; nothing here waits on a network
        const keys = partnerKeys(plan, await table.toArray(), partnerId);
        if (keys.length > 0) await table.bulkDelete(keys);
      }
    });
  }

  const next = { memberId: id(), coupleId: id() };
  await saveSettings({
    ...next,
    workerSecret: undefined,
    pendingInvite: undefined,
    pendingInviteExpiresAt: undefined,
    namingGateSeen: undefined,
    unlinkedAt: undefined,
  });
  forgetReportToken();

  if (before.memberId && before.coupleId) {
    await rekeyIdentity({ memberId: before.memberId, coupleId: before.coupleId }, next);
  }
}

/**
 * The server said this phone's link was ended by the other one.
 *
 * Nothing is deleted and nothing is sent: the phone keeps its data and simply
 * stops claiming to be paired, until the person chooses what to do next.
 */
export async function markUnlinked(refusedToken: string): Promise<void> {
  const { unlinkedAt, workerSecret } = await loadSettings();
  // Only if the token the server refused is still this phone's. A poll that was
  // in flight when the person chose to leave comes back refused too, after the
  // reset has already made this a fresh phone of one — and stamping "your link
  // was ended" onto that would tell someone who just left that they were removed.
  if (workerSecret === refusedToken && !unlinkedAt) await saveSettings({ unlinkedAt: now() });
}
