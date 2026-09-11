import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, loadSettings } from '../../db/database';
import { ensureIdentity, completeTask, coupleVitals, seedStarterPlan } from '../../db/repository';
import { todayKey } from '../../domain/day';
import { levelProgress } from '../../domain/xp';
import { openDailies } from '../../domain/rpg/task';
import { GEAR_SLOTS, SCHEDULED_TYPES, type Task } from '../../domain/rpg/types';
import { gearById } from '../../domain/rpg/gear';
import { dyeStyle } from '../../domain/rpg/dyes';
import { useTheme } from '../../themes/ThemeProvider';
import { getMascot } from '../pet/mascots';
import { QuestBoard } from '../quests/QuestBoard';
import { VitalsPanel, glowOf } from '../pet/VitalsPanel';
import { FeedPanel } from '../party/FeedPanel';
import { gearArt } from '../party/art/gear';

/**
 * Home. What the pet is doing, and what is left to do today.
 *
 * Used to be a ring of six door-bubbles around the mascot, with a pet card
 * below it. The ring is gone: it had its own six-door ceiling (crowding the
 * mascot past that), the tab bar had a different six-tab ceiling, and the two
 * disagreed on two of the six doors they both carried. Every destination now
 * lives on the tab bar or behind the menu — see nav.ts — which frees this
 * screen to answer a different question: not "where do I go", but "what does
 * today still want from me".
 *
 * The feed at the foot is the one thing here that looks backwards. It is also
 * where the four life-event kinds that had grants and no buttons finally get
 * them, because logging a hard day and seeing it land belong together.
 */
export function DashboardPage() {
  const { theme, calm } = useTheme();
  const settings = useLiveQuery(loadSettings, []);
  const day = todayKey(settings?.timeZone ?? 'America/Los_Angeles');

  // Settings only carries an identity once the app has written one somewhere
  // else first. A fresh install that lands here before ever opening Tasks
  // still needs one, for the same reason Tasks and Mood each mint their own:
  // see db/repository/identity.ts.
  const [identity, setIdentity] = useState<{ memberId: string; coupleId: string } | null>(null);
  useEffect(() => {
    let live = true;
    ensureIdentity()
      .then(async (next) => {
        await seedStarterPlan(next.memberId, next.coupleId, day);
        if (live) setIdentity(next);
      })
      .catch(() => {});
    return () => { live = false; };
  }, [day]);

  const memberId = settings?.memberId ?? identity?.memberId;
  const coupleId = settings?.coupleId ?? identity?.coupleId;

  // Dailies and goals together, because to the person looking at it there is
  // one list of what today still wants — a goal you set on purpose is not a
  // second, lesser checklist to go and find on another screen. Two point
  // lookups on the existing compound index rather than a scan; `openDailies`
  // filters both by `isDue`.
  const dailies = useLiveQuery(
    async (): Promise<Task[]> => (memberId
      ? (await Promise.all(
          SCHEDULED_TYPES.map((type) =>
            db.tasks.where('[memberId+type]').equals([memberId, type]).toArray()),
        )).flat()
      : []),
    [memberId],
  );
  const open = dailies ? openDailies(dailies, day) : [];

  const pet = useLiveQuery(
    () => (settings?.coupleId ? db.pet.get(settings.coupleId) : undefined),
    [settings?.coupleId],
  );
  const avatar = useLiveQuery(
    () => (memberId ? db.avatars.get(memberId) : undefined),
    [memberId],
  );

  // What the two of you have done, as opposed to what the pet has been given.
  // One query for both the panel below and the glow on the mascot above it, so
  // the two cannot disagree for a frame. Touches only the three entry tables —
  // no `loadSettings`, which would re-fire this on its own sync rewrite.
  const vitals = useLiveQuery(() => coupleVitals(day), [day]);
  const equippedIds = avatar ? GEAR_SLOTS.map((slot) => avatar.gear[slot]).filter(Boolean) as string[] : [];

  // `Pet.level` is carried forward from whoever last wrote the row and is never
  // recomputed, so the level shown is always derived from the XP instead. XP
  // only ever goes up — the pet cannot lose it, so this bar never runs backwards.
  const progress = levelProgress(pet?.xp ?? 0);
  const petMood = pet?.mood ?? 'content';
  const mascot = getMascot(theme.id);

  async function onComplete(task: Task) {
    await completeTask(task.id, day);
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">HeartBeat</h1>
        <p className="page-sub">
          {settings?.coupleId ? 'Paired' : 'Not paired yet'} · {day}
        </p>
      </header>

      {/* The dye is three CSS custom properties on the wrapper, which is the
          whole of how a colourway reaches the drawing — every mascot paints in
          those and nothing else, so none of the five files knows dyes exist. */}
      <div
        className="home-mascot-standalone"
        data-mood={petMood}
        data-calm={calm ? 'true' : 'false'}
        style={{
          ...dyeStyle(avatar?.dye),
          // The radiance, as 0..1. The pet never turns sad — it only loses its
          // glow, and it comes back the moment either of you logs anything.
          '--pet-radiance': vitals ? glowOf(vitals) : 1,
        } as React.CSSProperties}
        role="img"
        aria-label={`${mascot.name} the ${mascot.species}, level ${progress.level} and ${petMood}`}
      >
        <mascot.Art mood={petMood} />
      </div>

      <section className="home-pet">
        <div className="home-pet-head">
          <span className="home-pet-name">{mascot.name}</span>
          <span className="home-pet-level">
            Lv {progress.level} · {progress.into}/{progress.needed} XP
          </span>
        </div>
        <div className="home-pet-bar">
          <div className="home-pet-fill" style={{ width: `${progress.fraction * 100}%` }} />
        </div>
        <p className="home-pet-blurb">{mascot.blurb}</p>
      </section>

      {/* Directly under the pet, because it is the rest of the same sentence:
          the bar above is what the two of you have been *given* — quests, boss
          victories, tasks — and this is what you have *done*. */}
      <VitalsPanel vitals={vitals} />

      <section className="home-today">
        <h2 className="section-title">Today</h2>
        {open.length ? (
          <ul className="home-today-list">
            {open.map((task) => (
              <li className="home-today-row" key={task.id}>
                <button
                  type="button"
                  className="home-today-tick"
                  onClick={() => onComplete(task)}
                  aria-label={`Complete ${task.title}`}
                >
                  +
                </button>
                <span className="home-today-title">{task.title}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="section-sub">
            {dailies === undefined ? '' : 'Nothing waiting on the list today.'}
          </p>
        )}

        {equippedIds.length ? (
          <ul className="home-equipped" aria-label="Equipped">
            {equippedIds.map((itemId) => {
              const item = gearById(itemId);
              const Art = gearArt(itemId);
              if (!item || !Art) return null;
              return (
                <li key={itemId} className="home-equipped-item" title={item.name}>
                  <Art />
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      {coupleId ? (
        <QuestBoard coupleId={coupleId} day={day} timeZone={settings?.timeZone ?? 'America/Los_Angeles'} />
      ) : null}

      {/* Last, because it is the only backward-looking thing on the page. The
          screen reads pet, then what the two of you have done, then what today
          still wants, then the quest — and only then what has been happening. */}
      {coupleId && memberId ? (
        <FeedPanel
          coupleId={coupleId}
          memberId={memberId}
          day={day}
          tracksCycle={settings?.tracksCycle === true}
        />
      ) : null}
    </div>
  );
}
