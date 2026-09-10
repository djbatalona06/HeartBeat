import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, loadSettings } from '../../db/database';
import { ensureIdentity, completeTask, seedStarterPlan } from '../../db/repository';
import { todayKey } from '../../domain/day';
import { levelProgress } from '../../domain/xp';
import { openDailies } from '../../domain/rpg/task';
import { GEAR_SLOTS, type Task } from '../../domain/rpg/types';
import { gearById } from '../../domain/rpg/gear';
import { useTheme } from '../../themes/ThemeProvider';
import { getMascot } from '../pet/mascots';
import { QuestBoard } from '../quests/QuestBoard';
import { gearArt } from '../party/art/gear';

/**
 * Home. What the pet is doing, and what is left to do today.
 *
 * Used to be a ring of six door-bubbles around the mascot, with a pet card
 * below it. The ring is gone: it had its own six-door ceiling (crowding the
 * mascot past that), the tab bar had a different six-tab ceiling, and the two
 * disagreed on two of the six doors they both carried. Every destination now
 * lives on the nav rail instead — see nav.ts — which frees this screen to
 * answer a different question: not "where do I go", but "what does today
 * still want from me".
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

  const dailies = useLiveQuery(
    async (): Promise<Task[]> => (memberId
      ? db.tasks.where('[memberId+type]').equals([memberId, 'daily']).toArray()
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

      <div
        className="home-mascot-standalone"
        data-mood={petMood}
        data-calm={calm ? 'true' : 'false'}
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
    </div>
  );
}
