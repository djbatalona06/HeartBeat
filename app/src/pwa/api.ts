/**
 * The client half of the Pages Functions in app/functions/api.
 *
 * Same-origin, so there is no base URL to configure and nothing to get wrong
 * in Settings. The bearer is the same token pairing already stores as
 * `workerSecret` — one token, one source of truth, honoured by both the Worker
 * and these functions because they share the members table.
 */

import { TranscribeError } from './micErrors';

export interface ChatMessage {
  id: string;
  memberId: string;
  body: string;
  createdAt: number;
  /** Resolved server-side, so the thread renders without loading our own id. */
  mine: boolean;
}

export interface PairStarted {
  coupleId: string;
  memberId: string;
  token: string;
  invite: string;
  expiresAt: number;
}

export interface PairJoined {
  coupleId: string;
  memberId: string;
  token: string;
}

function authHeaders(token: string): HeadersInit {
  return { authorization: `Bearer ${token}` };
}

async function errorFrom(res: Response): Promise<TranscribeError> {
  const body = (await res.json().catch(() => null)) as
    | { stage?: string; error?: string }
    | null;
  if (body?.error) {
    return new TranscribeError(body.error, body.stage ?? 'transcribe', res.status);
  }
  // A non-JSON body here means the function itself fell over rather than
  // answering — say that, instead of blaming the recording.
  return new TranscribeError(
    `The server returned ${res.status} without a readable reason. That is a backend fault, not something you did.`,
    'speech-provider',
    res.status,
  );
}

/** Turn a recording into text. Throws TranscribeError, which carries the stage. */
export async function transcribe(audio: Blob, token: string): Promise<string> {
  const res = await fetch('/api/transcribe', {
    method: 'POST',
    headers: {
      ...authHeaders(token),
      'content-type': audio.type || 'audio/webm',
    },
    body: audio,
  });
  if (!res.ok) throw await errorFrom(res);
  const body = (await res.json()) as { text?: string };
  return (body.text ?? '').trim();
}

/** Everything said since `since`, oldest first. */
export async function fetchMessages(token: string, since: number): Promise<ChatMessage[]> {
  const res = await fetch(`/api/messages?since=${encodeURIComponent(String(since))}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw await errorFrom(res);
  const body = (await res.json()) as { messages?: ChatMessage[] };
  return body.messages ?? [];
}

export async function postMessage(token: string, body: string): Promise<ChatMessage> {
  const res = await fetch('/api/messages', {
    method: 'POST',
    headers: { ...authHeaders(token), 'content-type': 'application/json' },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as ChatMessage;
}

export async function pairStart(): Promise<PairStarted> {
  const res = await fetch('/api/pair/start', { method: 'POST' });
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as PairStarted;
}

export async function pairJoin(invite: string): Promise<PairJoined> {
  const res = await fetch('/api/pair/join', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ invite }),
  });
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as PairJoined;
}

export interface Health {
  ok: boolean;
  db: boolean;
  ai: boolean;
  /** Whether the deploy has a VAPID key at all. */
  push?: boolean;
  /**
   * The application server key `pushManager.subscribe` needs. Public by
   * construction — it reaches every browser that ever enables notifications.
   */
  vapidPublicKey?: string | null;
}

/** Never throws: "is the backend up" must not itself fail loudly. */
export async function health(): Promise<Health | null> {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) return null;
    return (await res.json()) as Health;
  } catch {
    return null;
  }
}

/** One half of the couple, as /api/profile serves it. */
export interface WireMember {
  id: string;
  coupleId: string;
  displayName: string;
  /**
   * Absent in practice: /api/profile does not serve `tracks_cycle`, because
   * cycle ownership is answered on the device rather than on the server.
   */
  tracksCycle?: boolean;
  photoDataUri?: string;
  updatedAt: number;
  mine: boolean;
}

/** Both members of the caller's couple, newest server copy. */
export async function fetchProfiles(token: string): Promise<WireMember[]> {
  const res = await fetch('/api/profile', { headers: authHeaders(token) });
  if (!res.ok) throw await errorFrom(res);
  return ((await res.json()) as { members: WireMember[] }).members;
}

/**
 * Updates my own row and returns both, so the caller never has to fetch again
 * to find out what the other side looks like now.
 *
 * `photoDataUri: null` clears the photo; omitting it leaves whatever is there.
 * The two cases are different on purpose — saving a new name must not quietly
 * delete a face.
 */
export async function putProfile(
  token: string,
  patch: { displayName?: string; photoDataUri?: string | null },
): Promise<WireMember[]> {
  const res = await fetch('/api/profile', {
    method: 'PUT',
    headers: { ...authHeaders(token), 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw await errorFrom(res);
  return ((await res.json()) as { members: WireMember[] }).members;
}

/* ---- notifications -------------------------------------------------------- */

/**
 * Register this device for delivery.
 *
 * The subscription came from the browser's own push service; all this does is
 * tell the server where to send. Throws on a real failure so the Settings block
 * can say what went wrong rather than showing a switch that silently did not
 * take.
 */
export async function subscribePush(
  token: string,
  subscription: { endpoint: string; p256dh: string; auth: string },
): Promise<void> {
  const res = await fetch('/api/subscribe', {
    method: 'POST',
    headers: { ...authHeaders(token), 'content-type': 'application/json' },
    body: JSON.stringify(subscription),
  });
  if (!res.ok) throw await errorFrom(res);
}

/** Stop delivering to this device. */
export async function unsubscribePush(token: string, endpoint: string): Promise<void> {
  const res = await fetch('/api/subscribe', {
    method: 'DELETE',
    headers: { ...authHeaders(token), 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  });
  if (!res.ok) throw await errorFrom(res);
}

export interface WireNudge {
  key: string;
  fireAt: number;
  title: string;
  body: string;
  path: string;
}

/**
 * Replace this member's queued reminders with the ones computed here.
 *
 * A replace rather than an append, all the way down: the endpoint deletes what
 * is undelivered in the same batch. That is what lets a phone that has been off
 * for a week recompute instead of coming back to a stack of notifications about
 * days it has since dealt with.
 */
export async function putNudges(token: string, nudges: WireNudge[]): Promise<number> {
  const res = await fetch('/api/nudges', {
    method: 'POST',
    headers: { ...authHeaders(token), 'content-type': 'application/json' },
    body: JSON.stringify({ nudges }),
  });
  if (!res.ok) throw await errorFrom(res);
  return ((await res.json()) as { scheduled?: number }).scheduled ?? 0;
}

/** Drop everything queued and not yet sent. */
export async function clearNudges(token: string): Promise<void> {
  const res = await fetch('/api/nudges', {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  if (!res.ok) throw await errorFrom(res);
}

/**
 * Photographs, to and from R2 via /api/media.
 *
 * They used to travel inside the sync payload as base64 and land in D1. These
 * two calls are what replaced that: the bytes go up once, and what syncs after
 * is a key. See `domain/media/objectKey.ts` for how the key is shaped and
 * `domain/media/photoWire.ts` for what still travels.
 */

export interface StoredMedia {
  key: string;
  hash: string;
  bytes: number;
}

/**
 * A data URI is what the capture ladder in `features/exercise/photo.ts`
 * produces, and decoding it here keeps that component free of upload concerns.
 * Throws on a malformed URI rather than uploading something unreadable.
 */
export function blobFromDataUri(dataUri: string): Blob {
  const comma = dataUri.indexOf(',');
  const header = dataUri.slice(0, comma);
  if (comma < 0 || !header.startsWith('data:')) throw new Error('not a data URI');
  const type = header.slice(5).split(';')[0] || 'application/octet-stream';
  const binary = atob(dataUri.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

/** Send one photograph. The key comes back; the server derives it from the bytes. */
export async function uploadMedia(blob: Blob, token: string): Promise<StoredMedia> {
  const res = await fetch('/api/media', {
    method: 'PUT',
    headers: { ...authHeaders(token), 'content-type': blob.type || 'image/jpeg' },
    body: blob,
  });
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as StoredMedia;
}

/**
 * Fetch one back as a data URI, which is what the rows and the `<img>` want.
 *
 * Returns null rather than throwing on a miss: a photograph that will not load
 * should leave a placeholder on the screen, not take the page down with it.
 */
export async function fetchMedia(key: string, token: string): Promise<string | null> {
  const res = await fetch(`/api/media?key=${encodeURIComponent(key)}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) return null;
  const blob = await res.blob();
  return await new Promise<string | null>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

/**
 * The link Jenny's study app uses to reach the pet.
 *
 * A token scoped to `/api/study/session` alone, minted from Settings on a
 * paired phone. The study app has no accounts of its own, so it cannot
 * authenticate as a member — and it must not be given a member's bearer, which
 * reads and writes the couple's whole record to do one thing.
 */

export interface StudyLink {
  fingerprint: string;
  timeZone: string;
  createdAt: number;
  lastUsedAt: number | null;
}

export async function listStudyLinks(token: string): Promise<StudyLink[]> {
  const res = await fetch('/api/study/link', { headers: authHeaders(token) });
  if (!res.ok) throw await errorFrom(res);
  return ((await res.json()) as { links: StudyLink[] }).links;
}

/**
 * Mint one. The plaintext comes back exactly once and is never stored here —
 * showing it again later would mean keeping a second copy of a credential.
 *
 * The timezone is captured at this moment because it is the only moment
 * anything server-side can learn it: this phone knows, and the study app has no
 * idea whose day it is measuring.
 */
export async function createStudyLink(token: string): Promise<{ token: string; timeZone: string }> {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const res = await fetch('/api/study/link', {
    method: 'POST',
    headers: { ...authHeaders(token), 'content-type': 'application/json' },
    body: JSON.stringify({ timeZone }),
  });
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as { token: string; timeZone: string };
}

export async function revokeStudyLink(token: string): Promise<void> {
  const res = await fetch('/api/study/link', { method: 'DELETE', headers: authHeaders(token) });
  if (!res.ok) throw await errorFrom(res);
}

/**
 * Compliments: asking for suggestions, sending one, and reading what arrived.
 *
 * `suggest` only ever returns candidates. Sending is a separate call the person
 * makes after choosing — a generated message delivered without anyone picking
 * it is a bot texting your partner.
 */

export interface ComplimentContext {
  tone: string;
  petName?: string;
  blocked?: string[];
  workoutStreak?: number;
  questName?: string;
  moodTrend?: 'up' | 'steady' | 'down';
  day: string;
}

export interface ReceivedCompliment {
  id: string;
  body: string;
  mine: boolean;
  deliverAt: number;
  readAt: number | null;
}

export async function suggestCompliments(
  context: ComplimentContext,
  token: string,
): Promise<string[]> {
  const res = await fetch('/api/compliment', {
    method: 'POST',
    headers: { ...authHeaders(token), 'content-type': 'application/json' },
    body: JSON.stringify(context),
  });
  if (!res.ok) throw await errorFrom(res);
  return ((await res.json()) as { candidates: string[] }).candidates;
}

export async function sendCompliment(
  input: { body: string; deliverAt?: number; generated: boolean; day: string },
  token: string,
): Promise<void> {
  const res = await fetch('/api/compliments', {
    method: 'POST',
    headers: { ...authHeaders(token), 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await errorFrom(res);
}

export async function listCompliments(token: string): Promise<ReceivedCompliment[]> {
  const res = await fetch('/api/compliments', { headers: authHeaders(token) });
  if (!res.ok) throw await errorFrom(res);
  return ((await res.json()) as { compliments: ReceivedCompliment[] }).compliments;
}

export async function markComplimentRead(id: string, token: string): Promise<void> {
  await fetch('/api/compliments', {
    method: 'PUT',
    headers: { ...authHeaders(token), 'content-type': 'application/json' },
    body: JSON.stringify({ id }),
  }).catch(() => {
    // Marking one read is housekeeping. Failing it should not surface anything.
  });
}

/**
 * Ask a question about the couple's own record.
 *
 * What the command menu falls back to when nothing matches a route. The answer
 * is assembled server-side from counts and dates — see functions/api/ask.ts,
 * which never reads what anyone wrote.
 */
export async function askAbout(question: string, token: string): Promise<string> {
  const res = await fetch('/api/ask', {
    method: 'POST',
    headers: { ...authHeaders(token), 'content-type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) throw await errorFrom(res);
  return ((await res.json()) as { answer: string }).answer;
}
