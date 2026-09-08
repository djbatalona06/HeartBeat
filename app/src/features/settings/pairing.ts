/**
 * The words and the arithmetic behind the pairing screen.
 *
 * Pairing is the one thing in this app that can fail for a reason the person
 * cannot see: the code was typed a character wrong, or read out four minutes
 * too late, or already used by the phone in the other room. The server answers
 * each of those with a different status, and a screen that renders all of them
 * as "that code did not work" throws away the only useful thing it was told.
 *
 * So every response the two pair endpoints can give gets its own sentence, and
 * every sentence names the next move. Nothing here scolds: a code that expired
 * is not a mistake, it is a code that expired.
 *
 * Kept DOM-free so vitest can reach it — see vitest.config.ts, which only
 * collects .ts.
 */

/** The alphabet functions/api/_lib.ts mints codes from. No O, I, 0 or 1. */
export const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const INVITE_LENGTH = 6;

/** The invite window, matched to INVITE_TTL_MS in functions/api/_lib.ts. */
export const INVITE_TTL_MS = 15 * 60 * 1000;

/**
 * What a typed code becomes before it is sent.
 *
 * Phones capitalise, autocorrect and helpfully insert spaces, and a code read
 * aloud across a room arrives with hyphens in it about half the time. All of
 * that is the app's problem, not the person's — so anything outside the
 * alphabet is dropped rather than rejected.
 */
export function normalizeInvite(raw: string): string {
  return [...raw.toUpperCase()]
    .filter((ch) => INVITE_ALPHABET.includes(ch))
    .slice(0, INVITE_LENGTH)
    .join('');
}

export function isCompleteInvite(code: string): boolean {
  return normalizeInvite(code).length === INVITE_LENGTH;
}

export type InviteStatus = 'none' | 'live' | 'expired';

export function inviteStatus(expiresAt: number | undefined, now: number): InviteStatus {
  if (!expiresAt) return 'none';
  return expiresAt > now ? 'live' : 'expired';
}

/**
 * m:ss, floored, never negative.
 *
 * Floored rather than rounded so the number on screen never claims a minute
 * that has already gone: at 59.6 seconds left this says 0:59, and the code
 * really is good for 59 more seconds.
 */
export function formatCountdown(msLeft: number): string {
  const total = Math.max(0, Math.floor(msLeft / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export interface PairFailure {
  title: string;
  message: string;
}

function statusOf(error: unknown): number {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : 0;
}

/**
 * Every answer /api/pair/join actually gives, turned into a sentence.
 *
 * The two 409s are told apart by their body rather than their status, because
 * "someone else already used this" and "you already have a partner" are
 * different problems with different next moves.
 */
export function pairFailure(error: unknown): PairFailure {
  const status = statusOf(error);
  const reason = error instanceof Error ? error.message : '';

  if (status === 400) {
    return {
      title: 'No code yet',
      message: `Type the ${INVITE_LENGTH} characters your partner reads out, then tap join.`,
    };
  }
  if (status === 404) {
    return {
      title: 'No pairing with that code',
      message:
        'Worth reading it back to each other — codes never contain O, I, zero or one, so those are usually a mis-hearing.',
    };
  }
  if (status === 409 && reason.includes('full')) {
    return {
      title: 'That pairing already has two phones',
      message:
        'A couple is two devices. If one of them is an old phone of yours, start a fresh pairing from the phone you are keeping.',
    };
  }
  if (status === 409) {
    return {
      title: 'That code has already been used',
      message: 'Each code works once. Ask them to start a new pairing and read out the new one.',
    };
  }
  if (status === 410) {
    return {
      title: 'That code has expired',
      message: 'Codes last fifteen minutes. Ask them to start a new pairing — it takes one tap.',
    };
  }
  if (status === 0) {
    return {
      title: 'The server did not answer',
      message:
        'Pairing is the one thing that needs it. Check the connection and try again; nothing on this phone was changed.',
    };
  }
  return {
    title: 'Pairing did not go through',
    message: reason || 'The server answered, but not with anything we could use. Try again.',
  };
}
