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

/** Never throws: "is the backend up" must not itself fail loudly. */
export async function health(): Promise<{ ok: boolean; db: boolean; ai: boolean } | null> {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) return null;
    return (await res.json()) as { ok: boolean; db: boolean; ai: boolean };
  } catch {
    return null;
  }
}

/** One half of the couple, as /api/profile serves it. */
export interface WireMember {
  id: string;
  coupleId: string;
  displayName: string;
  tracksCycle: boolean;
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
