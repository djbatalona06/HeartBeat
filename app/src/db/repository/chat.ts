import { db } from '../database';
import type { ChatMessage, MemberId } from '../../domain/types';
import { id, now } from './shared';


/**
 * Put a message in the thread before it has reached the server.
 *
 * It is written locally first and marked pending, so the thread shows what was
 * just said even on a train with no signal. `mine` is true by construction
 * here — you cannot optimistically send someone else's message.
 */
export async function draftMessage(
  coupleId: string,
  memberId: MemberId,
  body: string,
): Promise<ChatMessage | null> {
  const trimmed = body.trim();
  if (!trimmed) return null;
  const row: ChatMessage = {
    id: id(),
    coupleId,
    memberId,
    body: trimmed,
    createdAt: now(),
    mine: true,
    pending: true,
  };
  await db.messages.put(row);
  return row;
}

/**
 * Replace a pending message with the server's version of it.
 *
 * The server assigns the real id and timestamp, so the local row is deleted
 * rather than updated — leaving both would show the message twice, which is
 * exactly what an optimistic send is supposed to avoid.
 */
export async function confirmMessage(localId: string, confirmed: ChatMessage): Promise<void> {
  await db.transaction('rw', db.messages, async () => {
    await db.messages.delete(localId);
    await db.messages.put({ ...confirmed, pending: false });
  });
}

/**
 * Fold a pull from the server into the local thread.
 *
 * Server ids win, so a message that arrives twice — a retried poll, a message
 * of our own coming back around — lands on the same row rather than stacking.
 */
export async function mergeMessages(rows: ChatMessage[]): Promise<void> {
  if (rows.length === 0) return;
  await db.messages.bulkPut(rows.map((r) => ({ ...r, pending: false })));
}
