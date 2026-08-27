import { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, loadSettings } from '../../db/database';
import { confirmMessage, draftMessage, mergeMessages } from '../../db/repository';
import { fetchMessages, postMessage } from '../../pwa/api';
import type { ChatMessage } from '../../domain/types';

/**
 * The thread, kept in step with the server.
 *
 * Polling rather than a socket: the Worker has no Durable Object and a
 * long-lived connection on a phone that sleeps constantly is more machinery
 * than two people messaging each other needs. The interval backs off hard when
 * the panel is shut, so a closed thread costs almost nothing.
 */

/** While the panel is open and being read. */
const ACTIVE_MS = 4000;

/** While it is collapsed — enough to raise the unread dot without draining anything. */
const IDLE_MS = 30000;

export interface Thread {
  messages: ChatMessage[];
  send: (body: string) => Promise<void>;
  /** Null until pairing has happened; the panel explains itself when it is. */
  paired: boolean;
  offline: boolean;
}

export function useMessages(open: boolean): Thread {
  const settings = useLiveQuery(loadSettings, []);
  const token = settings?.workerSecret;
  const coupleId = settings?.coupleId;
  const memberId = settings?.memberId;
  const paired = Boolean(token && coupleId && memberId);

  const [offline, setOffline] = useState(false);
  const cursor = useRef(0);

  const messages = useLiveQuery(async () => {
    if (!coupleId) return [];
    return db.messages
      .where('[coupleId+createdAt]')
      .between([coupleId, 0], [coupleId, Infinity])
      .toArray();
  }, [coupleId]);

  const pull = useCallback(async () => {
    if (!token || !coupleId) return;
    try {
      const rows = await fetchMessages(token, cursor.current);
      setOffline(false);
      if (rows.length === 0) return;
      await mergeMessages(rows.map((r) => ({ ...r, coupleId })));
      cursor.current = Math.max(cursor.current, ...rows.map((r) => r.createdAt));
    } catch {
      // A failed poll is not worth telling anyone about; the thread already on
      // screen is still true, it is just not the newest.
      setOffline(true);
    }
  }, [token, coupleId]);

  // The cursor is seeded from what is already stored, so reopening the app
  // pulls the gap rather than the whole history again.
  useEffect(() => {
    if (!coupleId) return;
    let live = true;
    db.messages
      .where('[coupleId+createdAt]')
      .between([coupleId, 0], [coupleId, Infinity])
      .last()
      .then((row) => {
        if (live && row) cursor.current = Math.max(cursor.current, row.createdAt);
      })
      .catch(() => {});
    return () => { live = false; };
  }, [coupleId]);

  useEffect(() => {
    if (!paired) return;
    void pull();
    const every = open ? ACTIVE_MS : IDLE_MS;
    const timer = setInterval(() => {
      // A hidden tab has nobody reading it. Skip rather than tear the timer
      // down, so coming back does not need a fresh mount.
      if (document.visibilityState === 'visible') void pull();
    }, every);
    return () => clearInterval(timer);
  }, [paired, open, pull]);

  const send = useCallback(
    async (body: string) => {
      if (!token || !coupleId || !memberId) return;
      const local = await draftMessage(coupleId, memberId, body);
      if (!local) return;
      try {
        const confirmed = await postMessage(token, local.body);
        await confirmMessage(local.id, { ...confirmed, coupleId });
        cursor.current = Math.max(cursor.current, confirmed.createdAt);
        setOffline(false);
      } catch {
        // The local row stays, still pending, so what she typed is not lost.
        setOffline(true);
      }
    },
    [token, coupleId, memberId],
  );

  return { messages: messages ?? [], send, paired, offline };
}
