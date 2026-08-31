import Dexie, { type Table } from 'dexie';
import type {
  Achievement, ChatMessage, CycleEntry, ExerciseEntry, Member, MoodEntry, Pet, Quest, Settings,
  WorkEvent, WorkoutPhoto,
} from '../domain/types';
import { DEFAULT_SETTINGS } from '../domain/types';
import type { Avatar, LifeEvent, Redemption, Reward, Task } from '../domain/rpg/types';
import type { PetInstance } from '../domain/rpg/pets';

/**
 * The phone holds the whole record. The Worker keeps a copy so the other half
 * of the couple can read it, but the app never waits on the network to render.
 */
export class HeartBeatDB extends Dexie {
  members!: Table<Member, string>;
  moods!: Table<MoodEntry, string>;
  exercises!: Table<ExerciseEntry, string>;
  cycles!: Table<CycleEntry, string>;
  work!: Table<WorkEvent, string>;
  pet!: Table<Pet, string>;
  quests!: Table<Quest, string>;
  achievements!: Table<Achievement, string>;
  settings!: Table<Settings, string>;

  // v2 — the RPG layer.
  tasks!: Table<Task, string>;
  avatars!: Table<Avatar, string>;
  rewards!: Table<Reward, string>;
  redemptions!: Table<Redemption, string>;
  lifeEvents!: Table<LifeEvent, string>;

  // v4 — the thread.
  messages!: Table<ChatMessage, string>;

  // v3 — companions.
  pets!: Table<PetInstance, string>;

  // v5 — camera proof.
  workoutPhotos!: Table<WorkoutPhoto, string>;

  constructor() {
    super('heartbeat');
    this.version(1).stores({
      members: 'id, coupleId',
      // [memberId+day] is the hot path: every tile reads one member's day.
      moods: 'id, memberId, day, [memberId+day]',
      exercises: 'id, memberId, day, [memberId+day]',
      cycles: 'id, memberId, day, [memberId+day]',
      work: 'id, memberId, day, [memberId+day]',
      pet: 'coupleId',
      quests: 'id, coupleId, expiresAt',
      achievements: 'id, coupleId, code',
      settings: 'id',
    });

    // v2 adds the RPG layer. Dexie carries v1 rows forward untouched, so there
    // is no data migration here — the new stores simply start empty.
    this.version(2).stores({
      // [memberId+type] is the hot path: the Tasks page reads one person's
      // Dailies, then their Habits, then their To-Dos.
      tasks: 'id, coupleId, memberId, type, [memberId+type], archivedAt',
      avatars: 'memberId, coupleId',
      rewards: 'id, coupleId, memberId',
      redemptions: 'id, coupleId, memberId, day',
      // Life events are read two ways: one person's day, and the whole couple's
      // recent history for the Good Vibes cap.
      lifeEvents: 'id, coupleId, memberId, day, [memberId+day], [coupleId+day]',
    });

    // v3 adds companions. Split from v2 rather than folded into it so the two
    // phases stay legible in the schema history.
    this.version(3).stores({
      pets: 'id, coupleId, memberId, kindId, [memberId+kindId]',
    });

    // v4 adds the message thread. Kept as its own version for the same reason
    // v3 was: the schema history should read as the order things were built.
    this.version(4).stores({
      // Read one way only — this couple's thread, oldest first — so createdAt
      // is the index that matters. It doubles as the sync cursor.
      messages: 'id, coupleId, createdAt, [coupleId+createdAt]',
    });

    // v5 adds workout photos. Kept out of the entry rows on purpose: the sync
    // payload cap is measured in kilobytes and a photograph is not.
    this.version(5).stores({
      workoutPhotos: 'id, memberId, day, [memberId+day]',
    });
  }
}

export const db = new HeartBeatDB();

/**
 * Settings live in a single row rather than key/value pairs, and are always
 * read through here so the defaults spread underneath. New fields then need no
 * migration — they simply appear with their default.
 */
export async function loadSettings(): Promise<Settings> {
  const stored = await db.settings.get('settings');
  return { ...DEFAULT_SETTINGS, ...stored, id: 'settings' };
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const current = await loadSettings();
  await db.settings.put({ ...current, ...patch, id: 'settings' });
}
