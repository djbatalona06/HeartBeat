import { REKEY_TABLES, type RekeyRow, type TableRekey } from './rekey';

/**
 * What a phone lets go of when it leaves a couple.
 *
 * Leaving keeps your own data and lets go of the other person's. The order
 * matters and it is the reason this exists: `rekeyIdentity` carries every row
 * whose `coupleId` is the old one over to the new one, so a partner's `members`
 * row and their couple-keyed rows would ride along into the next couple and the
 * phone would find itself "linked" with someone who left. They have to be
 * dropped *before* the re-key.
 *
 * A row is the partner's when the field that says who it belongs to — the
 * first of the table's member fields — names them. `lifeEvents` also carries a
 * `fromMemberId`; a Good Vibe *to* you from them is still yours, so only the
 * owner field counts. Tables with no member field (`pet`, `quests`, `wagers`…)
 * are the couple's rather than a person's and are carried over, as before.
 */
export function partnerKeys(
  plan: TableRekey,
  rows: readonly RekeyRow[],
  partnerId: string,
): unknown[] {
  const owner = plan.memberFields[0];
  if (!owner) return [];
  return rows.filter((row) => row[owner] === partnerId).map((row) => row[plan.primaryKey]);
}

/** The tables that can hold somebody's rows, so the repository reads only those. */
export const PERSONAL_TABLES: readonly TableRekey[] = REKEY_TABLES.filter(
  (plan) => plan.memberFields.length > 0,
);
