/**
 * Short reflective sets that end in your journal.
 *
 * The deliberate non-feature here: **nothing is scored and nothing is stored
 * as a number.** A quiz that gives you a wellbeing score out of a hundred is
 * doing assessment, which this app is not qualified to do and which turns a
 * bad week into a bad grade. What these do instead is ask four questions and
 * hand the answers back as a draft journal entry — the value is in having
 * answered, and the artefact is prose you can edit.
 *
 * That is also why a quiz writes through `addReflection` rather than getting a
 * table: the output *is* a reflection, so it belongs in the journal with the
 * ones typed by hand.
 */

export interface Question {
  id: string;
  text: string;
  /** Four answers, weakest to strongest. Order matters for the summary. */
  options: readonly string[];
}

export interface Quiz {
  id: string;
  name: string;
  blurb: string;
  questions: readonly Question[];
}

export const QUIZZES: readonly Quiz[] = [
  {
    id: 'week',
    name: 'How was the week, really',
    blurb: 'Four questions. Two minutes.',
    questions: [
      {
        id: 'rest',
        text: 'How rested do you feel?',
        options: ['Running on empty', 'Patchy', 'Mostly fine', 'Genuinely rested'],
      },
      {
        id: 'people',
        text: 'How connected have you felt to people?',
        options: ['Alone with it', 'In touch, barely', 'Some good moments', 'Properly with people'],
      },
      {
        id: 'body',
        text: 'How has your body been treated?',
        options: ['Neglected', 'The basics only', 'Reasonably', 'Looked after'],
      },
      {
        id: 'point',
        text: 'How much of the week went on something that mattered?',
        options: ['None of it', 'A little', 'A decent share', 'Most of it'],
      },
    ],
  },
  {
    id: 'stress',
    name: 'What is actually going on',
    blurb: 'For when something is wrong and you cannot name it.',
    questions: [
      {
        id: 'where',
        text: 'Where do you feel it most?',
        options: ['In my chest', 'In my stomach', 'In my shoulders and jaw', 'Everywhere at once'],
      },
      {
        id: 'when',
        text: 'When is it worst?',
        options: ['First thing', 'During the day', 'In the evening', 'When I try to sleep'],
      },
      {
        id: 'what',
        text: 'If you had to guess at one cause?',
        options: ['Something at work', 'Something with a person', 'Money or admin', 'I genuinely do not know'],
      },
      {
        id: 'need',
        text: 'What would help most right now?',
        options: ['Sleep', 'To say it out loud', 'To do one thing about it', 'To be left alone for an hour'],
      },
    ],
  },
  {
    id: 'us',
    name: 'The two of you',
    blurb: 'Gentle, and worth sharing afterwards.',
    questions: [
      {
        id: 'seen',
        text: 'How seen have you felt this week?',
        options: ['Not much', 'In passing', 'Often enough', 'Really seen'],
      },
      {
        id: 'gave',
        text: 'How much did you give this week?',
        options: ['Very little', 'What I could', 'A fair amount', 'More than I had'],
      },
      {
        id: 'unsaid',
        text: 'Is there anything unsaid?',
        options: ['Quite a lot', 'One thing', 'Nothing important', 'Nothing at all'],
      },
      {
        id: 'next',
        text: 'What would make next week better together?',
        options: ['More time', 'Less friction', 'Something to look forward to', 'Just more of this'],
      },
    ],
  },
];

export function quizById(id: string | undefined): Quiz | undefined {
  return QUIZZES.find((q) => q.id === id);
}

/**
 * Turn answers into the draft entry.
 *
 * Prose, not a table and not a score — the person reads this back in their
 * journal months later, and "Rest: 2/4" means nothing by then. An unanswered
 * question is left out entirely rather than rendered as blank, so a quiz
 * abandoned halfway still produces something worth keeping.
 */
export function summarise(quiz: Quiz, answers: Readonly<Record<string, number>>): string {
  const lines = quiz.questions
    .filter((q) => Number.isInteger(answers[q.id]) && q.options[answers[q.id]] !== undefined)
    .map((q) => `${q.text}\n${q.options[answers[q.id]]}`);
  return lines.join('\n\n');
}

/** How many of the questions have been answered, for the progress line. */
export function answeredCount(quiz: Quiz, answers: Readonly<Record<string, number>>): number {
  return quiz.questions.filter((q) => Number.isInteger(answers[q.id])).length;
}
