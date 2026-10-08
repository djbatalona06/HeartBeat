import type { GuideCopy } from '../../ui/InfoBubble';

/**
 * What the (i) beside each title says: what to do on the page, in order, and
 * what it is worth in the game.
 *
 * One file, so the voice stays one voice and `guides.test.ts` can hold every
 * destination in `nav.ts` to having one, and every guide to being short. The
 * game lines name only mechanisms that exist in code — the charges are
 * `CHARGE_COPY` in `domain/rpg/charges.ts`, the raid stats `raidStats.ts` —
 * so a guide can never promise something the fight does not pay.
 */
export const GUIDES = {
  home: {
    title: 'Home',
    steps: [
      'Claim today\'s login coins when the popup asks.',
      'Tap Mood, Move or Work in the log strip to log them.',
      'Tick off today\'s dailies, and cheer anything in the feed.',
    ],
    game: 'Logging lights the day\'s charges for Eve\'s Garden; dailies pay you XP and coins and feed your shared pet. Day 7 of logins brings a purse.',
  },
  tasks: {
    title: 'Tasks',
    steps: [
      'Tap Add something, then pick Daily, Habit or To-do and how hard it is.',
      'Tap + when it is done, or − on a habit when you slip.',
      'Tap × to put a task away.',
    ],
    game: 'Each one pays XP, coins, energy and MP by difficulty, the same XP to your shared pet, and bond to your companion. A missed daily costs nothing.',
  },
  quests: {
    title: 'Quests',
    steps: [
      'Pick a difficulty and start this week\'s quest.',
      'Log what it counts in the rest of the app; it fills by itself.',
      'Achievements below are collected automatically when you look.',
    ],
    game: 'A finished quest and each achievement tier pay your shared pet XP, and finished quests count toward Together points.',
  },
  goals: {
    title: 'Goals',
    steps: [
      'Tap Browse ideas, or write your own with an area and a size.',
      'Tap + once a day when you keep it up.',
      'Tap × to put one away.',
    ],
    game: 'A goal pays exactly like a task: XP, coins, energy and MP, plus shared pet XP and companion bond.',
  },
  goalIdeas: {
    title: 'Goal ideas',
    steps: [
      'Tap areas to filter the ideas.',
      'Tap + to add one to your goals.',
      'Tap more to see further ideas.',
    ],
    game: 'Nothing here pays by itself. An idea you add becomes a goal, and the goal pays when you tick it.',
  },
  areas: {
    title: 'Areas',
    steps: [
      'See how much of today is done in each of the six areas.',
      'Tap a quiet area to find ideas for it.',
    ],
    game: 'No score here; it only reads your tasks. Logging three different kinds of thing in a day lights the Balance charge.',
  },
  activities: {
    title: 'Activities',
    steps: [
      'Pick something small from the grid.',
      'Follow it through; none of them take long.',
    ],
    game: 'These are for feeling better and are not scored. Log how you feel on Mood afterwards to light the Mood charge.',
  },
  breathe: {
    title: 'Breathing',
    steps: [
      'Pick a breathing pattern.',
      'Tap Start and follow the prompts.',
      'Pause or stop whenever you like.',
    ],
    game: 'Not scored. If it helped you rest, tick Rested on your mood check-in to light the Rest charge.',
  },
  reflections: {
    title: 'Reflections',
    steps: [
      'Read today\'s question, or tap to choose another.',
      'Write and tap Save.',
      'Open an old entry to share it or delete it.',
    ],
    game: 'Private and not scored. Ticking Grateful on your mood check-in is what lights the Gratitude charge.',
  },
  soundscapes: {
    title: 'Soundscapes',
    steps: [
      'Tap a sound to play it.',
      'Tap it again to stop.',
    ],
    game: 'Background sound for focus or rest. It is not scored.',
  },
  movements: {
    title: 'Movements',
    steps: [
      'Pick a set.',
      'Tap Start and follow each move.',
      'Log a real workout on Move if it was one.',
    ],
    game: 'These pay nothing. A workout logged on Move is what lights the Workout charge: physical moves hit 25% harder.',
  },
  quizzes: {
    title: 'Quizzes',
    steps: [
      'Pick a quiz.',
      'Answer the questions and finish.',
      'Edit what it wrote and tap Save it to keep it as a reflection.',
    ],
    game: 'Something to learn about yourselves. Nothing is scored.',
  },
  timer: {
    title: 'Timer',
    steps: [
      'Pick a length, or tap +1.',
      'Start it and get on with the thing.',
      'Pause or reset any time.',
    ],
    game: 'No sessions, history or XP. To light the Work charge, add the session to the calendar on Work.',
  },
  kindness: {
    title: 'Act of kindness',
    steps: [
      'Read today\'s act for your partner.',
      'Do it, then tap I did it to send them a Good Vibe.',
      'Or send one of the other acts.',
    ],
    game: 'A Good Vibe (3 a day) gives your partner 4 XP and 2 coins and you 2 XP and 1 coin, and counts toward the Being kind achievements.',
  },
  support: {
    title: 'Might help',
    steps: [
      'Read today\'s suggestions for each lane.',
      'Answer the optional question in Settings for ideas that fit you better.',
    ],
    game: 'Nothing here is counted. It is about feeling better, not points.',
  },
  firstAid: {
    title: 'First aid',
    steps: [
      'Read the signpost at the top first.',
      'Tap a routine to open its steps.',
      'Call your local emergency number if it is serious.',
    ],
    game: 'Not part of the game, and nothing here is stored.',
  },
  shop: {
    title: 'Shop',
    steps: [
      'Spend coins on a chest; each holds three prizes, with the odds shown.',
      'Buy today\'s surprise or a deal from the merchant.',
      'Refine gear you already own.',
    ],
    game: 'Everything you buy carries raid stats, so it makes you stronger in Eve\'s Garden. A pity counter guarantees a better prize after a bad run.',
  },
  friends: {
    title: 'Partner',
    steps: [
      'See your partner\'s bird and how many days you have both shown up.',
      'Tap Send good vibes (3 left a day).',
    ],
    game: 'A Good Vibe gives your partner 4 XP and 2 coins and you 2 XP and 1 coin. Both of you logging in a day lights the Both of you charge.',
  },
  birb: {
    title: 'Birb',
    steps: [
      'Hatch an egg for 120 coins, then pick who walks with you. Doing your own list charges their MP.',
      'Swipe or tap the tabs: Companions, Look (colours) and Room & yard.',
      'The birbhouse furnishes itself from the best piece either of you owns; plant its yard as plots open.',
    ],
    game: 'Companions, colours, furniture and plants all add raid stats. A kind you already have folds into the one you own instead of queueing a second. Plots open as your pet levels up.',
  },
  raid: {
    title: 'Raid',
    steps: [
      'Find "You are here" on the island path, then tap Enter Eve\'s Garden.',
      'Open a glowing star chest. Each semi-boss and boss you clear leaves one, free.',
      'Open Your raid sheet to compare gear, or Boss and adventures for the rest.',
    ],
    game: 'Star chests open with the Silver (semi-boss) or Gilded (boss) odds and cost nothing. Boss hits spend MP and a win pays pet XP. Adventures cost energy, and arriving first pays a coin bounty.',
  },
  eveGarden: {
    title: 'Eve\'s Garden',
    steps: [
      'Pick a companion. Strong here means it really hits harder on this boss.',
      'Walk to the monster with the direction pad to start the fight.',
      'Choose a move each turn; today\'s charges boost them.',
      'Every try at stage 7, the boss, asks if you are going in together for a bigger payout.',
    ],
    game: 'Clearing a stage pays pet XP, and the first clear pays coins. Together on the boss: +50% pet XP, 2× coins and a purse.',
  },
  bag: {
    title: 'Bag',
    steps: [
      'Check your coins and open any purses.',
      'Tap a gear slot to compare and swap what you wear.',
      'Read the raid sheet to see your totals.',
    ],
    game: 'The gear you wear sets the raid sheet Eve\'s Garden fights with. Purses open into coins.',
  },
  mood: {
    title: 'Mood',
    steps: [
      'Drag the three meters: Hunger, Joy and Moody.',
      'Tick Rested, Grateful or Ate well if true, add a note, and Save.',
      'Log your cycle further down if you track it.',
    ],
    game: 'A mood lights the Mood charge; the ticks light Rest, Gratitude and Ate well. It also adds Serenity and Bond to your shared pet.',
  },
  exercise: {
    title: 'Move',
    steps: [
      'Add your sets: exercise, reps and kg.',
      'Write a line about how it went and save.',
      'Take front and back photos as proof if you want.',
    ],
    game: 'A workout lights the Workout charge (physical moves +25%) and adds Vitality and Bond to your shared pet. It counts toward quests too.',
  },
  work: {
    title: 'Work',
    steps: [
      'Tap a day on the calendar.',
      'Tap Add something, or Say it instead.',
      'Give it a name and a time, then Add.',
    ],
    game: 'An event you add by hand lights the Work charge: magic moves hit 25% harder. Imported calendars do not count.',
  },
  settings: {
    title: 'Settings',
    steps: [
      'Pair your two phones, or manage the pairing.',
      'Pick a theme, and light or dark.',
      'Set cycle, calm and reminder options.',
    ],
    game: 'Nothing here changes the game, except pairing: the together bonuses need two of you.',
  },

  raidSheet: {
    title: 'Raid sheet',
    steps: [
      'Read your seven raid stats, biggest first.',
      'Check Where it comes from to see each source.',
      'Wear gear, buy furniture or plant to raise them.',
    ],
    game: 'These are the totals Eve\'s Garden fights with. More of the same bonus counts for less each time, so spread it out.',
  },
  vitals: {
    title: 'Together',
    steps: [
      'Vitality grows with workouts.',
      'Serenity grows with moods and cycle check-ins.',
      'Bond grows with every log, and most on days you both log.',
    ],
    game: 'Your shared pet\'s stage, Egg to Elder, reads these. Every 5 days you both log earns a streak shield.',
  },
  charges: {
    title: 'Charge',
    steps: [
      'Each light is something logged today, by either of you.',
      'Log the one marked ✦ to hit the monster\'s weakness.',
      'Log on Move, Mood or Work; the garden only shows them.',
    ],
    game: 'Workout: physical +25%. Work: magic +25%. Mood: wards +25%. Rest: Mend +50%. Both of you: every hit +10%. On the weakness: ×1.5.',
  },
  gear: {
    title: 'Gear',
    steps: [
      'Tap a slot: helmet, chestplate, boots or weapon.',
      'Compare what you own, then wear it or take it off.',
      'The amulet slot opens at pet level 2.',
    ],
    game: 'Each slot leans on different raid stats; the weapon leads with Burden. Buy and refine gear in the Shop.',
  },
} satisfies Record<string, GuideCopy>;

export type GuideId = keyof typeof GUIDES;

const BY_PATH: Record<string, GuideId> = {
  '/': 'home',
  '/tasks': 'tasks',
  '/quests': 'quests',
  '/goals': 'goals',
  '/goals/ideas': 'goalIdeas',
  '/areas': 'areas',
  '/activities': 'activities',
  '/activities/breathe': 'breathe',
  '/activities/reflections': 'reflections',
  '/activities/soundscapes': 'soundscapes',
  '/activities/movements': 'movements',
  '/activities/quizzes': 'quizzes',
  '/activities/timer': 'timer',
  '/activities/kindness': 'kindness',
  '/activities/support': 'support',
  '/activities/first-aid': 'firstAid',
  '/shop': 'shop',
  '/partner': 'friends',
  '/birb': 'birb',
  '/raid': 'raid',
  '/eve-garden': 'eveGarden',
  '/assets': 'bag',
  '/mood': 'mood',
  '/exercise': 'exercise',
  '/work': 'work',
  '/settings': 'settings',
};

/** The guide for a route, or undefined for a path with no page. */
export function guideForPath(path: string): GuideCopy | undefined {
  const id = BY_PATH[path];
  return id ? GUIDES[id] : undefined;
}
