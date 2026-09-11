/**
 * First aid: the screen for somebody's worst moment.
 *
 * Three rules shaped everything here, and they are worth stating because each
 * of them cost something.
 *
 * **It stores nothing.** No entry, no counter, no streak, nothing synced. A
 * person having the worst hour of their month should not later find it logged,
 * and should not have to wonder whether their partner can see that they opened
 * this. It is the only screen in the app that writes nothing at all.
 *
 * **It works unpaired.** `/activities/first-aid` is in `OPEN_WHILE_UNPAIRED`.
 * A page meant for a bad moment cannot sit behind a pairing gate.
 *
 * **It is not a crisis service, and says so.** This app is two people and a
 * bird. What it can honestly offer is a few things to do with your hands and a
 * clear push towards a real human; pretending to more than that would be the
 * actively harmful version of this feature. The signpost is deliberately not a
 * hardcoded phone number: numbers differ by country and a wrong one is worse
 * than none, so it names what to search for and who to call instead.
 */

export interface Step {
  /** Short, imperative, doable with shaking hands. */
  title: string;
  body: string;
}

export interface Routine {
  id: string;
  name: string;
  /** When to reach for this one, in the reader's own words. */
  when: string;
  steps: readonly Step[];
}

export const ROUTINES: readonly Routine[] = [
  {
    id: 'ground',
    name: 'Come back to the room',
    when: 'When everything feels far away, or too close.',
    steps: [
      { title: 'Five things you can see', body: 'Name them out loud if you can. Ordinary things count — a door, a mug, your own hand.' },
      { title: 'Four you can feel', body: 'The floor under your feet. The chair. Fabric. Something cold.' },
      { title: 'Three you can hear', body: 'Traffic, a fridge, your own breathing.' },
      { title: 'Two you can smell', body: 'If nothing, name two smells you like.' },
      { title: 'One you can taste', body: 'Or one thing you would want to.' },
    ],
  },
  {
    id: 'breathe',
    name: 'Make the out-breath longer',
    when: 'When your chest is tight or your breathing has gone shallow.',
    steps: [
      { title: 'In through your nose, for four', body: 'Do not try to breathe deeply. Just steadily.' },
      { title: 'Out through your mouth, for six', body: 'The long exhale is the part that does the work.' },
      { title: 'Again, ten times', body: 'The Breathing screen will count for you if that is easier.' },
    ],
  },
  {
    id: 'cold',
    name: 'Change your body first',
    when: 'When thinking your way out is clearly not working.',
    steps: [
      { title: 'Cold water on your face and wrists', body: 'Thirty seconds. This is a physical reset, not a metaphor.' },
      { title: 'Or step outside', body: 'Different air, different light, different room. Even a doorway counts.' },
      { title: 'Then move, a little', body: 'Walk to the end of the street and back. Do not decide anything while walking.' },
    ],
  },
  {
    id: 'next',
    name: 'Only the next thing',
    when: 'When it is all too much at once.',
    steps: [
      { title: 'Say the hard thing in one sentence', body: 'Out loud, or written down. One sentence, no more.' },
      { title: 'Name the smallest next step', body: 'Small enough to be slightly embarrassing. Fill a glass. Send one message.' },
      { title: 'Do only that', body: 'Then stop and decide again. Nothing after it has to be decided yet.' },
    ],
  },
  {
    id: 'reach',
    name: 'Tell somebody',
    when: 'When you have been carrying it alone for a while.',
    steps: [
      { title: 'Your partner is one tap away', body: 'The message thread does not need a good opening line. "Having a bad one" is enough.' },
      { title: 'Or somebody outside it', body: 'A friend, a family member, your GP. Being outside it is the useful part.' },
      { title: 'You do not have to explain it well', body: 'Explaining it well is a thing you can do later, or never.' },
    ],
  },
];

/**
 * The line about real help.
 *
 * Not a phone number. Numbers differ by country, they change, and a wrong one
 * in a moment like this is worse than none — so this names what to look for
 * and leaves finding it to the device that knows where it is.
 */
export const SIGNPOST = {
  title: 'If it is worse than a bad hour',
  body: 'If you are thinking about hurting yourself, or you cannot keep yourself safe, '
    + 'please talk to someone now: your local emergency number, a crisis line in your '
    + 'country, or your doctor. Search for "crisis line" and your country — it will '
    + 'be free, and they have heard it before.',
} as const;

export function routineById(id: string | undefined): Routine | undefined {
  return ROUTINES.find((r) => r.id === id);
}
