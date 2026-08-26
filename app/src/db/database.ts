import Dexie, { type Table } from 'dexie';
import type {
  Achievement, CycleEntry, ExerciseEntry, Member, MoodEntry, Pet, Quest, Settings, WorkEvent,
} from '../domain/types';
import { DEFAULT_SETTINGS } from '../domain/types';

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
