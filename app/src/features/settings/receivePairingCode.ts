/**
 * Receiving a pairing code, end to end.
 *
 * `pairing.ts` holds the fragments — normalize what was typed, decide whether
 * it is complete, turn a failed response into a sentence — but none of those
 * touch the network or the database, on purpose (see that file's header).
 * Something still has to stitch them together with the two real side effects:
 * redeeming the code against `/api/pair/join` and writing what comes back into
 * Dexie. That used to live only inside `SettingsPage`'s `join` handler, reachable
 * solely through a rendered form. Pulling it out gives the receiving side one
 * entry point a test can call directly — see receivePairingCode.test.ts.
 */
import { pairJoin, pairLeave, type PairJoined } from '../../pwa/api';
import { loadSettings } from '../../db/database';
import { savePairing } from '../../db/repository';
import { isPaired } from '../../domain/identity/rekey';
import { normalizeInvite, pairFailure, type PairFailure } from './pairing';

export type ReceivePairingResult =
  | { ok: true; joined: PairJoined }
  | { ok: false; failure: PairFailure };

/**
 * What "Join with this code" does: normalize whatever was typed (spaces,
 * hyphens, lower case all come off the keyboard that way), redeem it, and
 * store the result so this phone is paired the moment the request succeeds.
 *
 * Never throws — a code that does not work is an expected outcome here, not
 * an exception the caller has to guard against, so it comes back as `ok: false`
 * with the same sentence `pairFailure` gives the Settings screen today.
 */
export async function receivePairingCode(raw: string): Promise<ReceivePairingResult> {
  const code = normalizeInvite(raw);
  try {
    // Captured first: joining replaces the token, and the couple this phone
    // started (a couple of one, when both tapped Start) would otherwise be
    // left on the server with a member nobody holds a token for.
    const before = await loadSettings();
    const joined = await pairJoin(code);
    await savePairing(joined);
    if (isPaired(before) && before.workerSecret) {
      void pairLeave(before.workerSecret).catch(() => { /* best effort: it is empty either way */ });
    }
    return { ok: true, joined };
  } catch (e) {
    return { ok: false, failure: pairFailure(e) };
  }
}
