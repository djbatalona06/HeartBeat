import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { grantLifeEvent, putCheer } from '../../db/repository';
import { postCycleNudge } from '../../pwa/api';
import { buildFeed } from '../../domain/rpg/feed';
import {
  LIFE_EVENT_LINES, LIFE_EVENT_NAMES, checkGrant,
} from '../../domain/rpg/lifeEvents';
import type { LifeEvent, LifeEventKind } from '../../domain/rpg/types';
import type { DayKey } from '../../domain/types';

/**
 * What has been happening, and the two ways to add to it.
 *
 * Four of the five life-event kinds had grants, caps and copy written for them
 * and no way to reach any of it — only Good Vibes was ever created, from the
 * Friends screen. So this is a composer as much as a feed: logging a hard day
 * belongs next to seeing that it landed, and the loop only closes if both ends
 * are on the same screen.
 *
 * Everything here is read-only against the domain. `checkGrant` has always
 * returned prose explaining why a grant cannot be made and nothing has ever
 * shown it; the chips show it now, which is why none of them is a dead button.
 */

/** How much of the record to show. Enough to feel continuous, not a history. */
const FEED_LIMIT = 12;

/** The kinds you can log about yourself. Good Vibes come from the other person. */
const SELF_KINDS: LifeEventKind[] = ['hard-day', 'sick-day', 'period-start'];

interface Props {
  coupleId: string;
  memberId: string;
  day: DayKey;
  /** Cycle logging is the person's own statement about whether it applies. */
  tracksCycle: boolean;
  /** Whether this phone's owner has agreed to tell the other one. */
  shareCycleNudge: boolean;
  token?: string;
}

export function FeedPanel({
  coupleId, memberId, day, tracksCycle, shareCycleNudge, token,
}: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [milestone, setMilestone] = useState<string | null>(null);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 4200);
    return () => clearTimeout(timer);
  }, [message]);

  // One live query for both halves. The cheers come back in a single `anyOf`
  // rather than a lookup per event: this re-fires on every cheer, and a query
  // per row would be a dozen IndexedDB round trips each time.
  const data = useLiveQuery(async () => {
    const events = await db.lifeEvents
      .where('[coupleId+grantedAt]')
      .between([coupleId, 0], [coupleId, Number.MAX_SAFE_INTEGER])
      .reverse()
      .limit(FEED_LIMIT)
      .toArray();
    const cheers = events.length
      ? await db.cheers.where('eventId').anyOf(events.map((e) => e.id)).toArray()
      : [];
    return { events, cheers };
  }, [coupleId]);

  // The caps are per day, so the composer only needs today's rows to know what
  // it may still offer. Separate from the feed query, which is not day-scoped.
  const today = useLiveQuery(
    async () => db.lifeEvents.where('[coupleId+day]').equals([coupleId, day]).toArray(),
    [coupleId, day],
  );

  const members = useLiveQuery(
    async () => db.members.where('coupleId').equals(coupleId).toArray(),
    [coupleId],
  );

  const items = data ? buildFeed(data.events, data.cheers, memberId, FEED_LIMIT) : [];
  const kinds = SELF_KINDS.filter((kind) => kind !== 'period-start' || tracksCycle);

  function nameFor(id: string | undefined): string {
    if (!id) return 'Someone';
    if (id === memberId) return 'You';
    return (members ?? []).find((m) => m.id === id)?.displayName || 'Them';
  }

  async function log(kind: LifeEventKind, note?: string) {
    const result = await grantLifeEvent(coupleId, memberId, kind, day, { note });
    setMessage(result.ok ? 'Logged. The list can wait.' : result.reason ?? null);
    if (!result.ok) return;

    // A day one can tell the other phone, if this phone's owner has said it
    // may. Deliberately not awaited into the outcome above: the grant is a
    // local write that has to work with no signal, and a notification that did
    // not go out is not a reason to tell somebody their log failed.
    if (kind === 'period-start' && shareCycleNudge && token) {
      void postCycleNudge(token, day).catch(() => {});
    }
  }

  async function cheer(event: LifeEvent) {
    const result = await putCheer(coupleId, memberId, event);
    if (!result.ok) setMessage(result.reason ?? null);
  }

  return (
    <section className="feed">
      <h2 className="section-title">Lately</h2>

      <div className="feed-compose">
        {kinds.map((kind) => {
          const check = checkGrant(today ?? [], kind, memberId, day);
          return (
            <button
              key={kind}
              type="button"
              className="feed-chip"
              disabled={!check.ok}
              title={check.ok ? undefined : check.reason}
              onClick={() => void log(kind)}
            >
              {LIFE_EVENT_NAMES[kind]}
            </button>
          );
        })}
        <button
          type="button"
          className="feed-chip"
          onClick={() => setMilestone(milestone === null ? '' : null)}
        >
          {LIFE_EVENT_NAMES.milestone}
        </button>
      </div>

      {/* A bare milestone says nothing — it is the one kind where the note is
          the content, so the chip opens a field instead of granting. */}
      {milestone !== null ? (
        <div className="feed-milestone">
          <input
            className="field"
            value={milestone}
            maxLength={140}
            placeholder="What is worth marking?"
            aria-label="What the milestone was"
            onChange={(event) => setMilestone(event.target.value)}
          />
          <button
            type="button"
            className="primary"
            disabled={!milestone.trim()}
            onClick={() => {
              void log('milestone', milestone.trim());
              setMilestone(null);
            }}
          >
            Mark it
          </button>
        </div>
      ) : null}

      {items.length ? (
        <ul className="feed-list">
          {items.map(({ event, cheeredBy, cheered, cheerable }) => (
            <li className="feed-row" key={event.id}>
              <div className="feed-body">
                <span className="feed-who">
                  {/* Cycle data on the home screen is the one thing this panel
                      has to be careful with — features/cycle/lock.ts exists
                      because a phone is often face-up on a table. The line is
                      already written discreetly; the name is not, so for this
                      one kind the line is all that shows. */}
                  {event.kind === 'period-start'
                    ? nameFor(event.memberId)
                    : `${nameFor(event.fromMemberId ?? event.memberId)} · ${LIFE_EVENT_NAMES[event.kind]}`}
                </span>
                <span className="feed-line">
                  {event.note?.trim() || LIFE_EVENT_LINES[event.kind]}
                </span>
              </div>
              <button
                type="button"
                className={`feed-cheer ${cheered ? 'feed-cheer-on' : ''}`}
                disabled={!cheerable || cheered}
                aria-label={cheered ? 'Cheered' : `Cheer ${LIFE_EVENT_NAMES[event.kind]}`}
                onClick={() => void cheer(event)}
              >
                ♥{cheeredBy.length ? ` ${cheeredBy.length}` : ''}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="section-sub">
          {data === undefined
            ? ''
            : 'Nothing logged yet. A hard day, a good day, or a good vibe sent — they land here.'}
        </p>
      )}

      {message ? <div className="receipt" role="status">{message}</div> : null}
    </section>
  );
}
