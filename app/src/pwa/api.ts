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
