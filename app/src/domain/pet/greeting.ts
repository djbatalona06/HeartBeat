import { hash, roll } from '../hash';
import type { DayKey } from '../types';
import type { PetMood } from './mood';

/**
 * What the pet says when you open the app today.
 *
 * One line and one small pose, chosen from the couple and the day, so both
 * phones get the same hello and tomorrow gets a different one. It is the short
 * loop on top of the long one: open the app, the pet notices, close it.
 *
 * The lines are pooled by mood because a dozing pet should not bounce. They
 * never keep score: nothing here knows or says how long it has been, which is
 * the same position `domain/notify/schedule.ts` takes on reminders.
 * `greeting.test.ts` holds the pools to it.
 */

export const GREETING_POSES = ['wave', 'hop', 'peek', 'wiggle'] as const;
export type GreetingPose = (typeof GREETING_POSES)[number];

export const GREETING_LINES: Record<PetMood, readonly string[]> = {
  happy: [
    'Oh! It’s you! {name} has been saving a wiggle for this.',
    'Hello hello hello! Today feels like a good one.',
    '{name} did a little spin when the door opened.',
    'You’re here! Everything is sparkly now.',
    'Morning glow is on. {name} is ready for anything.',
    'Hi! {name} found a sunbeam and kept half for you.',
    'There you are. {name} is doing a happy dance.',
    'Big day energy! Let’s see what we get up to.',
  ],
  content: [
    'Hi. {name} is glad you stopped by.',
    'Oh, hello. Sit a minute?',
    '{name} looks up and gives you a slow blink.',
    'Nice to see you. The garden’s quiet and cozy.',
    'Hey you. {name} saved you the comfy spot.',
    'Hello! Whatever today holds, you’ve got company.',
    '{name} tilts its head. What are we doing today?',
    'Welcome back in. It’s nice with you here.',
  ],
  sleepy: [
    '{name} opens one eye and smiles.',
    'Mmm… hi. {name} is all curled up.',
    'Soft hello. It’s a slow kind of hour.',
    '{name} gives a very small, very sleepy wave.',
    'Shh, cozy time. Glad you’re here, though.',
    '*yawn* Oh! Hello, you.',
    '{name} scoots over to make room.',
    'Quiet hour. {name} hums a little hello.',
  ],
};

export interface GreetingInput {
  coupleId: string;
  day: DayKey;
  mood: PetMood;
  /** The mascot's name, for `{name}`. */
  name: string;
}

export interface Greeting {
  line: string;
  pose: GreetingPose;
}

export function greetingFor({ coupleId, day, mood, name }: GreetingInput): Greeting {
  const seed = hash(`${coupleId}:${day}`);
  const lines = GREETING_LINES[mood];
  // Two rolls off one seed, so the line and the pose vary independently
  // rather than every "hop" day always being the same sentence.
  const line = lines[Math.floor(roll(seed, 0) * lines.length)];
  const pose = GREETING_POSES[Math.floor(roll(seed, 1) * GREETING_POSES.length)];
  return { line: line.replace('{name}', name), pose };
}
