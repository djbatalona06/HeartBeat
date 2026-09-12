import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { DayKey } from '../../domain/types';
import { coupleTogether, settleTogether } from '../../db/repository';
import { DUO_WEEK_XP, DUO_WINDOW_DAYS } from '../../domain/rpg/together';

/**
 * The duo week and the Together ladder.
 *
 * A thin renderer, like `AchievementShelf`: `domain/rpg/together.ts` decides
 * everything and `settleTogether` is the single write. This file decides
 * nothing.
 *
 * It sits under the vitals bars rather than on a screen of its own for the same
 * reason those do — it is an answer to the question the pet already asks — and
 * it names no member anywhere. A week is the couple's or it is nobody's; there
 * is no view here that could say which of them missed Thursday.
 */
export function TogetherPanel({ coupleId, day }: { coupleId: string; day: DayKey }) {
  /**
   * Touches the three entry tables plus quests and achievements, so Dexie
   * re-runs it when any of them change and at no other time. No
   * `loadSettings` — that would re-fire this on its own sync rewrite, up to
   * twenty times a foreground cycle — so the day key arrives as a prop,
   * already in this member's timezone.
   */
  const view = useLiveQuery(
    () => (coupleId ? coupleTogether(coupleId, day) : undefined),
    [coupleId, day],
  );

  /**
   * Settling is a side effect of looking, which is the calm version: nothing
   * asks to be collected and nothing is missed by not visiting. The write is
   * idempotent — every award id is derived — so this re-running on its own
   * writes costs one read and finds nothing.
   */
  useEffect(() => {
    if (!coupleId || !view) return;
    void settleTogether(coupleId, day);
  }, [coupleId, day, view]);

  if (!view) return null;

  const { week, tier, next, points, toNext } = view;

  return (
    <section className="together">
      <div className="together-head">
        <h2 className="section-title">Your week</h2>
        <span className="together-tier" title={tier.blurb}>{tier.name}</span>
      </div>

      <ol
        className="together-week"
        role="meter"
        aria-label={`Days you both logged this week, out of ${DUO_WINDOW_DAYS}`}
        aria-valuenow={week.duoDays}
        aria-valuemin={0}
        aria-valuemax={DUO_WINDOW_DAYS}
      >
        {week.days.map((entry, index) => (
          <li
            key={entry.day}
            className="together-day"
            data-duo={entry.duo ? 'true' : 'false'}
            data-last={index === week.days.length - 1 ? 'true' : 'false'}
            aria-hidden="true"
          />
        ))}
      </ol>

      <p className="together-line">
        {week.complete
          ? <><strong>Seven for seven.</strong>{` +${DUO_WEEK_XP} XP to the pet.`}</>
          : `${week.duoDays} of ${DUO_WINDOW_DAYS} days with both of you. All seven pays ${DUO_WEEK_XP} XP.`}
      </p>

      <p className="section-sub">
        {next
          ? `${points} points together · ${toNext} to ${next.name}, worth ${next.xp} XP.`
          : `${points} points together · ${tier.blurb}`}
      </p>
    </section>
  );
}
