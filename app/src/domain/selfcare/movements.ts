/**
 * Movements: short sets you can do where you already are.
 *
 * Explicitly not the workout log. `features/exercise/` is for a session you
 * went and did, with a duration and camera proof; this is for two minutes of
 * unsticking yourself at a desk, and pays nothing. Keeping them apart is what
 * stops "stood up and stretched" competing with a real workout in the same
 * list — and what lets this one be genuinely small.
 *
 * The constraint every entry is written to: no equipment, no floor, no
 * changing clothes. A movement that needs a mat is a movement that gets read
 * and skipped.
 */

export interface Move {
  name: string;
  /** How long, in seconds. All short enough to just do. */
  seconds: number;
  how: string;
}

export interface MoveSet {
  id: string;
  name: string;
  blurb: string;
  moves: readonly Move[];
}

export const MOVE_SETS: readonly MoveSet[] = [
  {
    id: 'desk',
    name: 'Unstick',
    blurb: 'For a back that has been in a chair too long.',
    moves: [
      { name: 'Stand up', seconds: 15, how: 'All the way. Feet flat, weight even.' },
      { name: 'Roll your shoulders', seconds: 30, how: 'Backwards, slowly. Let your arms hang.' },
      { name: 'Look far away', seconds: 30, how: 'Out a window if there is one. Let your eyes unfocus.' },
      { name: 'Reach up', seconds: 30, how: 'Both arms overhead, then lean gently to each side.' },
      { name: 'Twist', seconds: 30, how: 'Seated or standing, turn slowly each way. Do not force it.' },
    ],
  },
  {
    id: 'wake',
    name: 'Wake up',
    blurb: 'For the first ten minutes of a day that has not started.',
    moves: [
      { name: 'Big stretch', seconds: 20, how: 'Arms up, fingers spread, and yawn if it comes.' },
      { name: 'Neck, side to side', seconds: 40, how: 'Ear towards shoulder. Hold. Breathe out.' },
      { name: 'March on the spot', seconds: 45, how: 'Knees up, unhurried. Just enough to feel warm.' },
      { name: 'Shake out your hands', seconds: 20, how: 'Wrists loose. Then your ankles, one at a time.' },
    ],
  },
  {
    id: 'wind-down',
    name: 'Wind down',
    blurb: 'For an hour before bed, without getting your heart up.',
    moves: [
      { name: 'Forward fold', seconds: 40, how: 'Knees soft, let your head hang. No bouncing.' },
      { name: 'Open your chest', seconds: 40, how: 'Hands behind your back, lift gently.' },
      { name: 'Slow neck circles', seconds: 40, how: 'Half circles, front only. Small.' },
      { name: 'Stand still', seconds: 40, how: 'Eyes closed. Notice your feet on the floor.' },
    ],
  },
  {
    id: 'stuck',
    name: 'Get unstuck',
    blurb: 'For when thinking has stopped working and you need your body first.',
    moves: [
      { name: 'Walk to another room', seconds: 30, how: 'Any other room. The point is the walking.' },
      { name: 'Shake it out', seconds: 30, how: 'Hands, arms, shoulders. Ridiculous is fine.' },
      { name: 'Ten slow breaths', seconds: 60, how: 'Out longer than in. Count them on your fingers.' },
      { name: 'Come back', seconds: 20, how: 'Sit down again and do only the next small thing.' },
    ],
  },
];

export function moveSetById(id: string | undefined): MoveSet | undefined {
  return MOVE_SETS.find((s) => s.id === id);
}

export function setSeconds(set: MoveSet): number {
  return set.moves.reduce((total, move) => total + move.seconds, 0);
}

/**
 * Which move a set is on, given elapsed seconds — the same clock-derived shape
 * as `phaseAt` in `breathing.ts`, and for the same reason: a counter that
 * accumulates drifts, and one that reads the clock cannot.
 */
export function moveAt(set: MoveSet, elapsed: number): { index: number; move: Move; remaining: number } | null {
  let into = Math.max(0, elapsed);
  for (let index = 0; index < set.moves.length; index += 1) {
    const move = set.moves[index];
    if (into < move.seconds) {
      return { index, move, remaining: Math.max(1, Math.ceil(move.seconds - into)) };
    }
    into -= move.seconds;
  }
  return null;
}
