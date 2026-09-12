import { db, loadSettings, saveSettings } from '../database';
import type { Gender, MemberId } from '../../domain/types';
import { now } from './shared';
import { ensureIdentity } from './identity';
import { rememberReportToken } from '../../pwa/crashReport';


/* ---- members ------------------------------------------------------------- */

/**
 * The two people, and the handful of settings the Settings screen owns.
 *
 * The members table has existed since v1 of the schema and nothing had ever
 * written to it, so a paired couple had two ids and no names. These are its
 * first writers. Both rows live on both phones: mine because I edited it,
 * theirs because /api/profile served it — which is what lets a partner's name
 * and face render with the network off, like everything else here.
 *
 * The wire shape is spelled out locally rather than imported so this section
 * stays self-contained; it is the JSON /api/profile returns, not the Dexie row.
 */
export interface IncomingMember {
  id: MemberId;
  coupleId: string;
  displayName: string;
  /**
   * Optional because /api/profile deliberately does not serve it: cycle
   * ownership is answered on the device, and the endpoint says so in as many
   * words. Declaring it required only made TypeScript agree with a field that
   * never arrives.
   */
  tracksCycle?: boolean;
  /**
   * Optional for a different reason: /api/profile *does* serve this one, but
   * only once the person has answered. An unanswered row arrives without it.
   */
  gender?: Gender;
  photoDataUri?: string;
  updatedAt: number;
}

/** Longer than anyone's name, short enough that it cannot be used as a note. */
export const MAX_DISPLAY_NAME = 40;

/** Room for a word or a short phrase. It never leaves the phone regardless. */
export const MAX_GENDER_NOTE = 60;

/**
 * What pairing hands back, written in one place so no screen has to remember
 * that three of these four fields are what "paired" means.
 *
 * The invite is kept because a reload should not lose a code that is still
 * good — the person reading it out has walked into the next room by then.
 */
export async function savePairing(result: {
  coupleId: string;
  memberId: MemberId;
  token: string;
  invite?: string;
  expiresAt?: number;
}): Promise<void> {
  await saveSettings({
    coupleId: result.coupleId,
    memberId: result.memberId,
    workerSecret: result.token,
    pendingInvite: result.invite,
    pendingInviteExpiresAt: result.expiresAt,
  });
  // Mirrored outside Dexie so a crash report can be authenticated by the error
  // boundary, which must not import anything that touches the database — see
  // pwa/crashReport.ts.
  rememberReportToken(result.token);
}

/** Both halves of the couple are together; the code has done its job. */
export async function clearPendingInvite(): Promise<void> {
  await saveSettings({ pendingInvite: undefined, pendingInviteExpiresAt: undefined });
}

/**
 * The durable half of the theme choice. ThemeProvider writes localStorage for
 * the first paint; this is the copy that outlives site data being cleared.
 */
export async function setThemeChoice(themeId: string): Promise<void> {
  await saveSettings({ themeId });
}

export async function setCalmMode(calmMode: boolean): Promise<void> {
  await saveSettings({ calmMode });
}

/**
 * Cycle ownership has one answer, and it is this one. `Member.tracksCycle` is
 * copied from it so the couple's rows are complete, and is never read back to
 * decide anything — see the note on Settings.tracksCycle.
 */
export async function setTracksCycle(tracksCycle: boolean): Promise<void> {
  await saveSettings({ tracksCycle });
  const { memberId, coupleId } = await ensureIdentity();
  const existing = await db.members.get(memberId);
  await db.members.put({
    id: memberId,
    coupleId,
    displayName: existing?.displayName ?? '',
    photoDataUri: existing?.photoDataUri,
    tracksCycle,
    gender: existing?.gender,
    updatedAt: now(),
  });
}

/**
 * Whether a day-one log tells the other phone.
 *
 * Settings-only and never mirrored: it is a decision about disclosure, not a
 * fact about the person, and the partner's device has no business knowing
 * whether it was made. The producer reads it on the tracker's own phone.
 */
export async function setShareCycleNudge(shareCycleNudge: boolean): Promise<void> {
  await saveSettings({ shareCycleNudge });
}

/**
 * How this person describes themselves, and — separately — what they wrote.
 *
 * Two destinations, on purpose. The coarse answer is mirrored onto `Member`
 * so it can be pushed to the couple's row and read by the other phone, which
 * is the only reason it leaves this device at all: content about supporting
 * your partner has to know something about your partner.
 *
 * `note` is the free text behind "other" and goes **only** to Settings. It is
 * never mirrored, never pushed, and never accepted by /api/profile. Nothing
 * reads it as logic, so putting it on a server would widen what is stored
 * about somebody in exchange for no behaviour whatsoever.
 */
export async function setGender(gender: Gender, note?: string): Promise<void> {
  await saveSettings({
    gender,
    // Cleared when the answer is no longer "other", so a note cannot linger
    // out of sight describing an answer the person has since changed.
    genderNote: gender === 'other' ? note?.trim().slice(0, MAX_GENDER_NOTE) : undefined,
  });
  const { memberId, coupleId } = await ensureIdentity();
  const existing = await db.members.get(memberId);
  await db.members.put({
    id: memberId,
    coupleId,
    displayName: existing?.displayName ?? '',
    photoDataUri: existing?.photoDataUri,
    tracksCycle: existing?.tracksCycle ?? false,
    gender,
    updatedAt: now(),
  });
}

/**
 * My own name and face.
 *
 * `photoDataUri: null` means "take it off", which is different from leaving it
 * out — a patch that omits the photo must not silently delete one.
 */
export async function putMyProfile(patch: {
  displayName?: string;
  photoDataUri?: string | null;
}): Promise<IncomingMember> {
  const { memberId, coupleId } = await ensureIdentity();
  const settings = await loadSettings();
  const existing = await db.members.get(memberId);
  const photo = patch.photoDataUri === undefined ? existing?.photoDataUri : patch.photoDataUri;
  const row = {
    id: memberId,
    coupleId,
    displayName: (patch.displayName ?? existing?.displayName ?? '')
      .trim()
      .slice(0, MAX_DISPLAY_NAME),
    tracksCycle: settings.tracksCycle === true,
    gender: settings.gender,
    photoDataUri: photo ?? undefined,
    updatedAt: now(),
  };
  await db.members.put(row);
  return row;
}

/**
 * Rows the server served. Newer wins, decided by the row's own `updatedAt` on
 * both sides — the same rule pwa/sync.ts uses, so an edit made on this phone
 * while it was offline is not undone by an older copy coming back.
 */
export async function saveMembersFromServer(rows: IncomingMember[]): Promise<number> {
  let applied = 0;
  for (const row of rows) {
    const existing = await db.members.get(row.id);
    if (existing && existing.updatedAt >= row.updatedAt) continue;
    await db.members.put({
      id: row.id,
      coupleId: row.coupleId,
      displayName: row.displayName,
      // The server does not serve this one, so a served row must not erase the
      // copy `setTracksCycle` mirrors here — otherwise saving a name blanks it.
      tracksCycle: row.tracksCycle ?? existing?.tracksCycle ?? false,
      // Same guard, different cause: this one *is* served, but only after it
      // has been answered, so an unanswered row must not erase a local answer
      // that has not been pushed yet.
      gender: row.gender ?? existing?.gender,
      photoDataUri: row.photoDataUri,
      updatedAt: row.updatedAt,
    });
    applied += 1;
  }
  return applied;
}
