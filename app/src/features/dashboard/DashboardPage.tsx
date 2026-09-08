import { useLiveQuery } from 'dexie-react-hooks';
import { db, loadSettings } from '../../db/database';
import { todayKey } from '../../domain/day';
import { levelProgress } from '../../domain/xp';
import { Tile } from '../../components/Tile';
import { DECKS } from '../../content/study';
import { dueCount, newCount } from '../../domain/study/queue';

export function DashboardPage() {
  const settings = useLiveQuery(loadSettings, []);
  const day = todayKey(settings?.timeZone ?? 'America/Los_Angeles');
  const memberId = settings?.memberId;

  const mood = useLiveQuery(
    () => (memberId ? db.moods.where('[memberId+day]').equals([memberId, day]).first() : undefined),
    [memberId, day],
  );
  const exercise = useLiveQuery(
    () => (memberId ? db.exercises.where('[memberId+day]').equals([memberId, day]).first() : undefined),
    [memberId, day],
  );
  const pet = useLiveQuery(
    () => (settings?.coupleId ? db.pet.get(settings.coupleId) : undefined),
    [settings?.coupleId],
  );
  // Whether there is a cycle log at all, not what is in it: the tile is a door,
  // and a door should not read out what is behind it to whoever walks past.
  const hasCycle = useLiveQuery(async () => (await db.cycles.count()) > 0, []);

  // The tile reads the whole backlog rather than one deck's, because the
  // number worth seeing from the home screen is "is there anything", not
  // "which deck".
  const studyDue = useLiveQuery(async () => {
    const rows = await db.studyProgress.toArray();
    const byCard = new Map(rows.map((row) => [row.cardId, row]));
    const due = DECKS.reduce((n, deck) => n + dueCount(deck, byCard, day), 0);
    return { due, fresh: DECKS.reduce((n, deck) => n + newCount(deck, byCard), 0) };
  }, [day]);

  const progress = levelProgress(pet?.xp ?? 0);

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">HeartBeat</h1>
        <p className="page-sub">
          {settings?.coupleId ? 'Paired' : 'Not paired yet'} · {day}
        </p>
      </header>

      <section className="pet-card">
        <div className="pet-level">Lv {progress.level}</div>
        <div className="pet-bar">
          <div className="pet-bar-fill" style={{ width: `${progress.fraction * 100}%` }} />
        </div>
        <div className="pet-xp">
          {progress.into} / {progress.needed} XP
        </div>
      </section>

      <div className="grid">
        <Tile
          to="/settings"
          title="Settings"
          glyph="☰"
          value={settings?.onboarded ? 'Ready' : 'Set up'}
          hint="Pairing, theme, partner"
        />
        <Tile
          to="/exercise"
          title="Exercise"
          glyph="▲"
          value={exercise ? `${exercise.sets.length} sets` : '–'}
          hint="Log and camera proof"
        />
        <Tile
          to="/mood"
          title="Mood"
          glyph="◑"
          value={mood ? `${mood.joy}/10 joy` : '–'}
          hint="Hunger, joy, moody"
        />
        <Tile
          to="/work"
          title="Work"
          glyph="▦"
          value="–"
          hint="Shared calendar"
        />
        <Tile
          to="/study"
          title="Study"
          glyph="◆"
          value={studyDue ? (studyDue.due > 0 ? `${studyDue.due} due` : '–') : '–'}
          hint="Flashcards and quizzes"
        />
        <Tile
          to="/cycle"
          title="Cycle"
          glyph="☾"
          value={hasCycle ? 'Logged' : '–'}
          hint="Private to the two of you"
        />
      </div>
    </div>
  );
}
