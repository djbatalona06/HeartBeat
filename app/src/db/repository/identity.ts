import { db, loadSettings, saveSettings } from '../database';
import type { MemberId } from '../../domain/types';
import { id } from './shared';


/**
 * The app has to work on the phone that installed it first, before there is a
 * partner to pair with, so a solo identity is minted locally on first use.
 *
 * Pairing later replaces both ids with the ones the Worker issues. Rows written
 * before that point keep the provisional ids; `rekeyIdentity` below carries
 * them over the moment that happens.
 */
export async function ensureIdentity(): Promise<{ memberId: MemberId; coupleId: string }> {
  const settings = await loadSettings();
  if (settings.memberId && settings.coupleId) {
    return { memberId: settings.memberId, coupleId: settings.coupleId };
  }
  const memberId = settings.memberId ?? id();
  const coupleId = settings.coupleId ?? id();
  await saveSettings({ memberId, coupleId });
  return { memberId, coupleId };
}
/* ---- identity repair ---- */

// Imports are hoisted, so this one sits with the section it belongs to rather
// than at the top of a file three other screens are editing this week.
import {
  REKEY_TABLES,
  carriesIdentity,
  isUsableIdentity,
  needsWholeTable,
  planRekey,
  sameIdentity,
  type Identity,
  type RekeyRow,
} from '../../domain/identity/rekey';

/**
 * Carry this device's rows over when its identity changes.
 *
 * `ensureIdentity` above mints a provisional pair on first use and pairing
 * replaces both, which left everything logged before pairing wearing ids nobody
 * has: never synced, never in a "mine" view again. This is the repair for that,
 * and for the same thing happening again if the couple ever re-pairs.
 *
 * What moves where is `domain/identity/rekey.ts` — it is pure, so the awkward
 * parts (a primary key that is itself an id, a day that already has an answer)
 * are decided somewhere they can be tested. This walks the plan inside one
 * transaction so a phone that dies halfway does not wake up half re-keyed.
 *
 * Idempotent: a second run finds no row still carrying `from` and writes
 * nothing. Returns how many rows it touched.
 */
export async function rekeyIdentity(from: Identity, to: Identity): Promise<number> {
  if (!isUsableIdentity(from) || !isUsableIdentity(to)) return 0;
  if (sameIdentity(from, to)) return 0;

  // The sync watermarks belonged to the identity being left, so they go with
  // it. `syncPushedAt` especially: a re-keyed row keeps the `updatedAt` it was
  // written with, which on a re-pair is older than the watermark, so the row
  // would sit below it and never be offered to the server — the same silence
  // this repair exists to end. Starting both from zero is safe in both
  // directions, because push and pull each settle on the newer `updatedAt`.
  await saveSettings({ syncPushedAt: 0, syncPulledAt: 0 });

  // A planned table the schema does not have yet — one arriving with a later
  // version — is skipped rather than thrown over.
  const present = new Set(db.tables.map((table) => table.name));
  const plans = REKEY_TABLES.filter((plan) => present.has(plan.table));

  return db.transaction('rw', plans.map((plan) => plan.table), async () => {
    let touched = 0;
    for (const plan of plans) {
      const table = db.table<RekeyRow, unknown>(plan.table);
      // Only the tables whose plan can collide are read whole. `workoutPhotos`
      // holds a data URI per row, and pulling every one into memory to decide
      // nothing is how a re-pair after a year of proofs runs a phone out of it.
      const rows = needsWholeTable(plan)
        ? await table.toArray()
        : await table.filter((row) => carriesIdentity(row, plan, from)).toArray();
      for (const action of planRekey(plan, rows, from, to)) {
        if (action.verb === 'put') {
          await table.put(action.row);
        } else if (action.verb === 'move') {
          // The key is the id, so the row cannot be updated where it lies.
          await table.delete(action.oldKey);
          await table.put(action.row);
        } else {
          await table.delete(action.oldKey);
        }
        touched += 1;
      }
    }
    return touched;
  });
}
