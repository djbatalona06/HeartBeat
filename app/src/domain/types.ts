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
  /**
   * The R2 object holding the bytes, content-addressed by their SHA-256.
   *
   * Optional for two reasons, both temporary and both real: rows written before
   * photographs moved out of D1 have no key, and a shot taken offline has no
   * key until its upload lands. `dataUri` covers both cases.
   */
  key?: string;
  /** The SHA-256 the key is named by, so a cached copy can be trusted. */
  hash?: string;
  /**
   * The bytes, held locally.
   *
   * This is what the screen actually renders, which is why it survived the move
   * to R2: a proof taken on this phone should appear instantly and keep
   * appearing on a train with no signal. On the partner's phone it starts
   * absent and is filled in the first time the shot is looked at.
   *
   * It is no longer what travels. The sync payload carries the key.
   */
  dataUri?: string;
  /** True until the bytes have reached R2. The sync loop retries these. */
  pendingUpload?: boolean;
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
  /**
   * What is placed in the birbhouse, one furniture id per slot.
   *
   * On the couple's pet rather than either avatar, because the house is the
   * thing the two of you keep together — the same reasoning as the pet's own
   * XP. Either partner can rearrange it and it changes for both. Optional, so
   * every row already stored reads `undefined` and no schema version is spent;
   * always read it through `normalizeHouse` in `domain/rpg/furniture.ts`, which
   * drops pieces that have since been retired from the catalogue.
   */
  house?: Partial<Record<string, string>>;
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
  /**
   * How a generated compliment should sound, and what it must never say.
   *
   * The sender's, not the couple's: these are the words *this* person would
   * use, and two people in one relationship do not talk the same way. All
   * optional, so they spread under DEFAULT_SETTINGS and need no migration.
   */
  complimentTone?: 'tender' | 'playful' | 'funny' | 'proud';
  /** What the sender calls them. Blank means the model uses no name. */
  complimentPetName?: string;
  /** Words this couple does not want to see. A candidate carrying one is
   *  dropped rather than shown, because seeing it at all is the harm. */
  complimentBlocked?: string[];
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
  /**
   * Set the moment the starter plan is seeded, so it is planted exactly once
   * per install rather than re-appearing after every one of its eight tasks
   * has been renamed or retired. See `seedStarterPlan` in
   * `db/repository/rpg.ts`.
   */
  starterPlanSeededAt?: number;
  /**
   * Set the moment someone chooses "look around anyway" on the Welcome
   * screen — a browser visitor who has not installed the app to a Home
   * Screen, told once what that costs them, and let through regardless. See
   * `features/onboarding/WelcomePage.tsx`.
   */
  guestAcknowledged?: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  timeZone: DEFAULT_TIMEZONE,
  themeId: 'kitty',
  calmMode: false,
  onboarded: false,
};
