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

/**
 * One half of the couple: a name, a face, and which of the two they are.
 *
 * Both rows live on both phones — mine written when I edit it, theirs written
 * from whatever /api/profile served — so the partner's name and photo render
 * offline like everything else. Newer `updatedAt` wins, the same rule sync uses
 * for every other row.
 */
export interface Member {
  id: MemberId;
  coupleId: CoupleId;
  displayName: string;
  /**
   * Mirrors `Settings.tracksCycle`, which is the one that decides anything.
   * Cycle ownership is a property of a device — the phone holding the PIN —
   * so it is answered in settings and only copied here for display.
   */
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
  /** A line about the session, in the person's own words. */
  caption?: string;
  /** Camera proof, front and back, stored as data URIs on-device. */
  proofFront?: string;
  proofBack?: string;
  updatedAt: number;
}

/**
 * A workout photograph, kept in its own table rather than on the entry row.
 *
 * The entry row is what `pwa/sync.ts` sends, and the endpoint refuses a payload
 * over 64 KiB. A photograph riding along on it would fail the push, and because
 * the watermark only advances on success it would take mood, cycle and the
 * calendar down with it — silently. So the photograph lives somewhere sync does
 * not look.
 */
export interface WorkoutPhoto {
  id: string;
  memberId: MemberId;
  day: DayKey;
  /** Which camera it came from. */
  facing: 'front' | 'back';
  /** A downscaled JPEG as a data URI. */
  dataUri: string;
  bytes: number;
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

/**
 * One XP gain, carrying the id the server counts it under.
 *
 * XP is additive, so an award that is delivered twice is worth twice as much
 * unless something says it is the same award. The id is that something: the
 * server records it once and ignores the replay. For a boss victory the id is
 * derived from the fight, so the two phones reporting the same victory report
 * one award rather than two.
 */
export interface PetXpAward {
  id: string;
  amount: number;
  awardedAt: number;
}

/** The shared pet. Levels from XP earned by both partners. */
/**
 * The most one award may carry, and the longest its id may be. Mirrored by
 * MAX_AWARD_XP / MAX_AWARD_ID in functions/api/pet.ts, which is the authority —
 * these exist so the phone never builds an award the endpoint will refuse.
 */
export const MAX_AWARD_XP = 5000;
export const MAX_AWARD_ID = 100;

export interface Pet {
  coupleId: CoupleId;
  level: number;
  xp: number;
  /** Derived from recent activity; drives which sprite pose shows. */
  mood: 'happy' | 'content' | 'sleepy' | 'sulking';
  fedAt: number;
  /**
   * Awards made on this phone that the server has not counted yet. They are
   * already in `xp`, so the bar moves offline; they stay here until a flush
   * comes back with them settled.
   */
  pendingXp?: PetXpAward[];
  /**
   * The couple-wide total the server last confirmed — both partners' gains.
   * `xp` never falls below it.
   */
  sharedXp?: number;
  /**
   * Award ids already counted into `xp` here, newest last and bounded. It stops
   * a re-reported victory from being added to the local bar a second time; the
   * server's own key stops it being added to the shared total.
   */
  awardedXpIds?: string[];
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
  /**
   * The window, as days rather than instants, because that is how a quest is
   * described and how its progress is counted. `endsOn` is inclusive: seven
   * days means seven days of chances.
   */
  startedOn?: DayKey;
  endsOn?: DayKey;
  /**
   * When the target was reached. This is the guard that makes a quest pay once
   * — `reckon` refuses to award anything to a quest that carries it, so
   * progress arriving after the fact, or a second reconcile, finds nothing to
   * hand out.
   */
  completedAt?: number;
  /** When the week ran out with the target unmet. Nothing is taken; it stops. */
  retiredAt?: number;
}

export interface Achievement {
  id: string;
  coupleId: CoupleId;
  code: string;
  xp: number;
  unlockedAt: number;
}

/**
 * One line of the couple's thread, mirrored locally so it reads offline.
 *
 * `mine` is resolved by the server rather than compared here: the thread has to
 * render before Settings has necessarily loaded, and getting the side wrong is
 * the kind of bug you only notice in a screenshot.
 */
export interface ChatMessage {
  id: string;
  memberId: MemberId;
  coupleId: CoupleId;
  body: string;
  createdAt: number;
  mine: boolean;
  /** Set while a message is on its way, cleared once the server has it. */
  pending?: boolean;
}

export interface Settings {
  id: 'settings';
  coupleId?: CoupleId;
  memberId?: MemberId;
  timeZone: string;
  /**
   * The durable copy of the theme choice. ThemeProvider reads and writes
   * `localStorage['heartbeat.theme']` so the first paint needs no async read;
   * this row is what survives that being cleared, and the two are reconciled
   * on the Settings screen — see features/settings/theme.ts.
   */
  themeId: string;
  /** Same arrangement: the picker holds it in React state, this outlives it. */
  calmMode: boolean;
  /**
   * Reminders. Both are absent until notifications are turned on from a tap,
   * which is the only way they can be turned on at all.
   */
  notifyHour?: number;
  notifyOn?: boolean;
  workerUrl?: string;
  workerSecret?: string;
  /** Cached from /api/health so the switch can render before the network answers. */
  vapidPublicKey?: string;
  /**
   * What the browser's push service handed out. Kept because a subscription is
   * addressed by endpoint, and there is no other way to name the one this
   * phone registered when the time comes to unsubscribe it.
   */
  pushEndpoint?: string;
  onboarded: boolean;
  /**
   * Sync watermarks.
   *
   * `syncPushedAt` is a local clock reading: rows edited after it have not been
   * sent. `syncPulledAt` is the server's own cursor, echoed back from the rows
   * it served — never a local timestamp, because a phone whose clock is a
   * minute fast would otherwise ask for changes since a future moment and skip
   * everything the other phone wrote in between.
   */
  syncPushedAt?: number;
  syncPulledAt?: number;
  /** Set when the cycle page is locked; see features/cycle/lock.ts. */
  cyclePinSalt?: string;
  cyclePinHash?: string;
  /**
   * Whether this device's owner logs a cycle, rather than reading their
   * partner's. Undefined until asked — which is different from "no", because
   * "no" is an answer and undefined is a question not yet put.
   *
   * It lives here rather than on Member because identity in this app is a
   * device with a memberId in settings. `Member.tracksCycle` mirrors this
   * value and is never read for a decision; this field is the answer.
   */
  tracksCycle?: boolean;
  /**
   * The invite this phone last issued, kept so a reload does not lose a code
   * that is still good — the countdown on the Settings screen is drawn from
   * `pendingInviteExpiresAt`, not from when the component happened to mount.
   */
  pendingInvite?: string;
  pendingInviteExpiresAt?: number;
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  timeZone: DEFAULT_TIMEZONE,
  themeId: 'kitty',
  calmMode: false,
  onboarded: false,
};
