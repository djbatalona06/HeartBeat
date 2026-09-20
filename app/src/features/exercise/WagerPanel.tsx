import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { dropWager, readWager, settleWagers, startWager } from '../../db/repository';
import { WAGER_TARGETS, daysLeft, stakeFor, standingsOf } from '../../domain/wager/engine';
import { Chip } from '../../ui/Chip';
import { SecondaryAction } from '../../ui/SecondaryAction';
import type { DayKey } from '../../domain/types';

/**
 * The week the two of you staked something on.
 *
 * A thin renderer, like `QuestBoard`: `domain/wager/engine.ts` decides
 * everything and `settleWagers` writes. Nothing here works out whether a week
 * was won.
 *
 * ## Both of you, aiming at the same number
 *
 * Not a race. `domain/notifications/derive.ts` argues the posture about badges
 * and `domain/notify/schedule.ts` argues it about push, and both land in the
 * same place: nothing in this app exists to tell somebody they are behind. A
 * weekly scoreboard between two people who live together is exactly that with
 * a trophy on it. So the target is shared, the stake is the pet's XP — which
 * belongs to neither of you alone — and missing costs nothing.
 *
 * That is also why the other person's number is shown plainly rather than
 * ranked, and why a week that ran out says so once and stops talking.
 */
export interface WagerPanelProps {
  coupleId: string | null;
  /** This device's member, so its own row reads "You". */
  memberId: string | null;
  /** Any day in the week to show. */
  day: DayKey;
  /**
   * The real today, which is not the day on screen.
   *
   * Settling asks "is this week over yet", and answering that against a day
   * the person happens to be looking at would mean a finished week never
   * closing while they browsed back through March.
   */
  today: DayKey;
}

export function WagerPanel({ coupleId, memberId, day, today }: WagerPanelProps) {
  // Both of the couple, because a member who has not trained has no exercise
  // row and would otherwise be dropped from the standing entirely — which
  // would make the wager read as met by whoever happened to show up. See
  // `standingsOf`.
  const members = useLiveQuery(
    async () => (coupleId ? db.members.where('coupleId').equals(coupleId).toArray() : []),
    [coupleId],
  );
  const memberIds = (members ?? []).map((m) => m.id);

  /**
   * Reads the wager *and* the week's workouts, so logging a set re-fires this
   * and the effect below settles. Watching only `wagers` would mean the row sat
   * still until something wrote to it — which, since settling is the only
   * thing that does, is never. The same trap `QuestBoard` names.
   */
  const reading = useLiveQuery(
    async () => (coupleId ? readWager(coupleId, day, memberIds) : undefined),
    [coupleId, day, memberIds.join(',')],
  );

  /**
   * Settling is idempotent and writes nothing while a week is still running,
   * so re-running it on its own writes costs a read. It takes today rather
   * than the day on screen: a finished week is closed by looking at any week,
   * which is what stops last week's sitting open forever.
   */
  useEffect(() => {
    if (!coupleId || !reading || memberIds.length === 0) return;
    void settleWagers(coupleId, today, memberIds);
  }, [coupleId, today, memberIds.join(','), reading?.step?.verb]);

  if (!coupleId) return null;
  // Still loading. An empty panel for a frame is better than "no wager yet"
  // flashing over a week that has one.
  if (reading === undefined) return null;

  const { wager, counts, step } = reading;

  return (
    <section className="sheet">
      <h2 className="section-title">The week's wager</h2>

      {!wager ? (
        <>
          <p className="section-sub">
            Pick a number you will both hit this week. The birb gets the XP if
            you both make it, and nothing happens if you do not.
          </p>
          <div className="wager-targets" role="radiogroup" aria-label="Workouts each, this week">
            {WAGER_TARGETS.map((target) => (
              <Chip
                key={target}
                asRadio
                onClick={() => { void startWager(coupleId, day, target); }}
              >
                {target} each · {stakeFor(target)} XP
              </Chip>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="section-sub">
            {step?.verb === 'won' || (step?.verb === 'settled' && step.met)
              ? `You both made it. The birb took ${wager.stake} XP.`
              : step?.verb === 'missed' || (step?.verb === 'settled' && !step.met)
                ? 'This one ran out. Nothing lost — the next week is its own.'
                : `${wager.target} each, ${wager.stake} XP for the birb. ${left(wager.weekStart, day)}`}
          </p>

          <ul className="wager-standings">
            {standingsOf(wager, memberIds, counts).map((standing) => (
              <li className="wager-standing" key={standing.memberId} data-met={standing.met ? 'true' : undefined}>
                <span className="wager-who">
                  {standing.memberId === memberId ? 'You' : nameOf(members, standing.memberId)}
                </span>
                <span className="wager-count">{standing.done} of {wager.target}</span>
                <span className="wager-mark" aria-hidden="true">{standing.met ? '✓' : ''}</span>
              </li>
            ))}
          </ul>

          {/* Only while it is live. Giving up a week that has already been paid
              or closed would be editing a record of something that happened. */}
          {step?.verb === 'running' ? (
            <SecondaryAction onClick={() => { void dropWager(coupleId, day); }}>
              Call it off
            </SecondaryAction>
          ) : null}
        </>
      )}
    </section>
  );
}

/** "Four days left", or nothing once the week is out. */
function left(weekStart: DayKey, day: DayKey): string {
  const n = daysLeft({ weekStart }, day);
  if (n <= 0) return '';
  return n === 1 ? 'Last day.' : `${n} days left.`;
}

/**
 * The other person, in the name they chose.
 *
 * Falls back to "Them" rather than to an id: a member row can be absent on a
 * phone that has paired but not yet pulled the profile, and a raw uuid in a
 * sentence is worse than a pronoun.
 */
function nameOf(members: { id: string; displayName?: string }[] | undefined, id: string): string {
  return members?.find((m) => m.id === id)?.displayName?.trim() || 'Them';
}
