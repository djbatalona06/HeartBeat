/**
 * Days are calendar dates in a named zone, never UTC instants. A 7am reminder
 * has to stay at 7am across a daylight-saving boundary, and pinning to a fixed
 * offset silently serves it an hour late for eight months of the year.
 */
export type DayKey = string; // 'YYYY-MM-DD'
export type MinuteOfDay = number; // 0..1439

export const DEFAULT_TIMEZONE = 'America/Los_Angeles';

/** Which half of the couple a row belongs to. */
export type MemberId = string;
export type CoupleId = string;

export interface Member {
  id: MemberId;
  coupleId: CoupleId;
  displayName: string;
  /** Set by whoever installed first; decides who sees the cycle inputs. */
  tracksCycle: boolean;
  photoDataUri?: string;
  updatedAt: number;
}

/** The three meters on the Mood tile, each 1-10. */
export interface MoodEntry {
  id: string;
  memberId: MemberId;
  day: DayKey;
  hunger: number;
  joy: number;
  moody: number;
  note?: string;
  updatedAt: number;
}

export interface ExerciseSet {
  name: string;
  reps: number;
  weightKg?: number;
}

export interface ExerciseEntry {
  id: string;
  memberId: MemberId;
  day: DayKey;
  sets: ExerciseSet[];
  /** Camera proof, front and back, stored as data URIs on-device. */
  proofFront?: string;
  proofBack?: string;
  updatedAt: number;
}

/**
 * Cycle logging, narrowed from lunara's DailyLog. `checkInComplete` is carried
 * over deliberately: without it there is no way to tell a symptom-free day from
 * a day nobody opened the app.
 */
export interface CycleEntry {
  id: string;
  memberId: MemberId;
  day: DayKey;
  checkInComplete?: boolean;
  flow?: 'light' | 'medium' | 'heavy' | 'clots';
  periodStart?: boolean;
  symptoms?: string[];
  moods?: string[];
  notes?: string;
  updatedAt: number;
}

export interface WorkEvent {
  id: string;
  memberId: MemberId;
  day: DayKey;
  /**
   * Minutes past midnight, or absent for an all-day event. Birthdays and
   * anniversaries are the ones people most want on a shared calendar, and
   * neither of them starts at a time.
   */
  startsAt?: MinuteOfDay;
  endsAt?: MinuteOfDay;
  title: string;
  source: 'manual' | 'import';
  updatedAt: number;
}

/** The shared pet. Levels from XP earned by both partners. */
export interface Pet {
  coupleId: CoupleId;
  level: number;
  xp: number;
  /** Derived from recent activity; drives which sprite pose shows. */
  mood: 'happy' | 'content' | 'sleepy' | 'sulking';
  fedAt: number;
}

export type QuestDifficulty = 'easy' | 'steady' | 'hard';

export interface Quest {
  id: string;
  coupleId: CoupleId;
  templateId: string;
  difficulty: QuestDifficulty;
  title: string;
  target: number;
  progress: number;
  xp: number;
  expiresAt: number;
}

export interface Achievement {
  id: string;
  coupleId: CoupleId;
  code: string;
  xp: number;
  unlockedAt: number;
}

export interface Settings {
  id: 'settings';
  coupleId?: CoupleId;
  memberId?: MemberId;
  timeZone: string;
  themeId: string;
  calmMode: boolean;
  workerUrl?: string;
  workerSecret?: string;
  vapidPublicKey?: string;
  pushEndpoint?: string;
  onboarded: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  timeZone: DEFAULT_TIMEZONE,
  themeId: 'kitty',
  calmMode: false,
  onboarded: false,
};
