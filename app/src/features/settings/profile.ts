/**
 * Saving this member's name (and optionally a photo), locally and on the
 * server, in one place.
 *
 * Two writers want the same sequence — write it here so it renders with no
 * network, then push it so the other phone sees it too: the "who you are"
 * block on Settings, and the naming gate a device sees the moment pairing
 * actually completes (see `features/pairing/namingGate.ts`). Only one of them
 * should decide how that sequence goes.
 */
import { putMyProfile, saveMembersFromServer } from '../../db/repository';
import { putProfile } from '../../pwa/api';

export async function saveProfile(
  patch: { displayName?: string; photoDataUri?: string | null },
  token: string | undefined,
): Promise<void> {
  await putMyProfile(patch);
  if (token) await saveMembersFromServer(await putProfile(token, patch));
}
