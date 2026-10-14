import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { feedPet, loadCare, performRitual } from '../../db/repository';
import {
  FOOD, FEED_KINDS, appetiteOf, careCaption, describeFeed, favouriteFor, feedsNewestFirst,
  gotFavourite, ritualStates, togetherCareDays,
  type FoodItem, type RitualKind,
} from '../../domain/rpg/care';
import { useTheme } from '../../themes/ThemeProvider';
import { getMascot } from '../pet/mascots';
import { SecondaryAction } from '../../ui/SecondaryAction';

/**
 * Looking after the shared pet: feed it, and the three small rituals.
 *
 * Everything on screen is derived in `domain/rpg/care.ts` and read in one live
 * query (`loadCare`), so this component decides nothing -- it only draws and
 * calls the two repository writes. Both of you see the same pantry, because the
 * food is earned by *either* of your logs, and either of you can feed any of it.
 *
 * The tone is the rest of the app's: nothing here drains and nothing scolds. An
 * unfed pet is "peckish", a skipped ritual is just not ticked.
 */

interface Props {
  memberId: string;
  coupleId: string;
  /** Today in this member's own timezone, passed in rather than read here. */
  day: string;
  say: (message: string | null, tone?: 'error' | 'success') => void;
}

const WHO = { mine: 'Yours', theirs: 'Theirs' } as const;

export function CarePanel({ memberId, coupleId, day, say }: Props) {
  const { theme } = useTheme();
  const mascot = getMascot(theme.id);
  const care = useLiveQuery(() => loadCare(day), [day]);
  const members = useLiveQuery(() => db.members.toArray(), []);

  if (!care) return <section className="panel care" aria-busy="true" />;

  const coupleMembers = (members ?? []).map((m) => m.id);
  const rituals = ritualStates(care.acts, day, memberId, coupleMembers);
  const together = rituals.filter((r) => r.together).length;
  const appetite = appetiteOf(care.acts, day);
  const favourite = favouriteFor(theme.id);
  const recent = feedsNewestFirst(care.acts).slice(0, 3);
  const days = togetherCareDays(care.acts);
  const caption = careCaption(appetite, together, gotFavourite(care.acts, day, theme.id));

  const onFeed = async (item: FoodItem) => {
    const result = await feedPet(coupleId, memberId, item, day);
    if (!result.ok) { say(result.reason ?? null); return; }
    say(item.earnerId === memberId
      ? `${mascot.name} ate the ${FOOD[item.kind].name.toLowerCase()}.`
      : `${mascot.name} ate the ${FOOD[item.kind].name.toLowerCase()} they earned.`);
  };

  const onRitual = async (kind: RitualKind) => {
    const result = await performRitual(coupleId, memberId, kind, day);
    if (!result.ok) say(result.reason ?? null, 'error');
  };

  return (
    <section className="panel care" aria-label={`Looking after ${mascot.name}`}>
      <h2 className="section-title">Looking after {mascot.name}</h2>
      {/* The one live region: it speaks the caption when it changes and nothing else. */}
      <p className="section-sub care-caption" role="status">{caption}</p>

      <h3 className="care-heading">Pantry</h3>
      {care.pantry.length > 0 ? (
        <ul className="care-pantry">
          {care.pantry.map((item) => {
            const mine = item.earnerId === memberId;
            const food = FOOD[item.kind];
            return (
              <li className="care-item" key={item.key}>
                <span className="care-item-text">
                  <span className="care-item-name">{food.name}</span>
                  <span className="care-item-who">
                    {mine ? WHO.mine : WHO.theirs}
                    {item.kind === favourite ? ` · ${mascot.name}'s favourite` : ''}
                    {mine ? '' : ' · feed it for them'}
                  </span>
                </span>
                <SecondaryAction onClick={() => onFeed(item)}>Feed</SecondaryAction>
              </li>
            );
          })}
        </ul>
      ) : (
        <>
          <p className="section-sub">
            Nothing waiting. Food is earned by logging, and it keeps for a day.
          </p>
          <ul className="care-earn">
            {FEED_KINDS.map((kind) => (
              <li key={kind}>
                <strong>{FOOD[kind].name}:</strong> {FOOD[kind].earnedBy}.
              </li>
            ))}
          </ul>
        </>
      )}

      {recent.length > 0 ? (
        <ul className="care-recent" aria-label="Recently fed">
          {recent.map((act) => (
            <li key={act.id}>{describeFeed(act, memberId)}</li>
          ))}
        </ul>
      ) : null}

      <h3 className="care-heading">Today&apos;s rituals</h3>
      <ul className="care-rituals">
        {rituals.map(({ ritual, mine, together: both, doneBy }) => (
          <li className="care-ritual" key={ritual.id}>
            <SecondaryAction disabled={mine} onClick={() => onRitual(ritual.id)}>
              {mine ? `${ritual.name}: done` : ritual.verb}
            </SecondaryAction>
            <span className="care-ritual-note">
              {both
                ? 'You both did this one.'
                : doneBy.length > 0 && !mine
                  ? 'They did this one. Your turn?'
                  : ritual.blurb}
            </span>
          </li>
        ))}
      </ul>

      {days > 0 ? (
        <p className="section-sub care-days">
          {days === 1
            ? 'One day you both looked after it.'
            : `${days} days you both looked after it.`}
        </p>
      ) : null}
    </section>
  );
}
