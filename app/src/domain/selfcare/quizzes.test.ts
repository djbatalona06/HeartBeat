import { describe, expect, it } from 'vitest';
import { QUIZZES, answeredCount, quizById, summarise } from './quizzes';

describe('the quizzes', () => {
  it('repeats no id and no name', () => {
    expect(new Set(QUIZZES.map((q) => q.id)).size).toBe(QUIZZES.length);
    expect(new Set(QUIZZES.map((q) => q.name)).size).toBe(QUIZZES.length);
  });

  it('gives every question four answers, weakest first', () => {
    for (const quiz of QUIZZES) {
      expect(quiz.questions.length, quiz.id).toBeGreaterThanOrEqual(3);
      for (const question of quiz.questions) {
        expect(question.options, `${quiz.id}/${question.id}`).toHaveLength(4);
        for (const option of question.options) {
          expect(option.trim().length, `${quiz.id}/${question.id}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('repeats no question id within a quiz', () => {
    for (const quiz of QUIZZES) {
      const ids = quiz.questions.map((q) => q.id);
      expect(new Set(ids).size, quiz.id).toBe(ids.length);
    }
  });

  it('finds one by id', () => {
    expect(quizById('week')?.name).toBe('How was the week, really');
    expect(quizById('nope')).toBeUndefined();
  });
});

describe('summarise', () => {
  const quiz = QUIZZES[0];

  it('writes prose, not a score', () => {
    // A number out of four means nothing when this is read back in six months,
    // and scoring wellbeing is assessment this app is not qualified to do.
    const out = summarise(quiz, { rest: 0, people: 3 });
    expect(out).toContain(quiz.questions[0].text);
    expect(out).toContain(quiz.questions[0].options[0]);
    expect(out).not.toMatch(/\d\s*\/\s*\d/);
  });

  it('leaves unanswered questions out entirely', () => {
    // A quiz abandoned halfway should still produce something worth keeping,
    // not a page of questions followed by blanks.
    const out = summarise(quiz, { rest: 1 });
    expect(out).toContain(quiz.questions[0].text);
    expect(out).not.toContain(quiz.questions[1].text);
  });

  it('is empty when nothing was answered', () => {
    expect(summarise(quiz, {})).toBe('');
  });

  it('ignores an answer index that is out of range', () => {
    expect(summarise(quiz, { rest: 99 })).toBe('');
    expect(summarise(quiz, { rest: -1 })).toBe('');
  });

  it('keeps the questions in the order they were asked', () => {
    const out = summarise(quiz, { rest: 0, people: 0, body: 0, point: 0 });
    const positions = quiz.questions.map((q) => out.indexOf(q.text));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});

describe('answeredCount', () => {
  const quiz = QUIZZES[0];

  it('counts only real answers', () => {
    expect(answeredCount(quiz, {})).toBe(0);
    expect(answeredCount(quiz, { rest: 0 })).toBe(1);
    expect(answeredCount(quiz, { rest: 0, people: 2 })).toBe(2);
  });

  it('counts a zero answer, which is a real choice', () => {
    // The weakest option is index 0, and treating it as "unanswered" would
    // silently drop the answers that matter most.
    expect(answeredCount(quiz, { rest: 0 })).toBe(1);
  });
});
