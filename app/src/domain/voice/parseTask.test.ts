import { describe, expect, it } from 'vitest';
import { parseTask } from './parseTask';

describe('parseTask', () => {
  it('reads type and difficulty out of a full sentence', () => {
    expect(parseTask('add a daily habit, drink water, easy')).toEqual({
      title: 'Drink water',
      type: 'daily',
      difficulty: 'easy',
    });
  });

  it('treats a plain sentence as an easy to-do', () => {
    expect(parseTask('call the dentist')).toEqual({
      title: 'Call the dentist',
      type: 'todo',
      difficulty: 'easy',
    });
  });

  it('strips the openers people actually say', () => {
    expect(parseTask('remind me to take the bins out').title).toBe('Take the bins out');
    expect(parseTask('add a task to book the flights').title).toBe('Book the flights');
    expect(parseTask('i need to renew my passport').title).toBe('Renew my passport');
  });

  // "add sugar" is a real task. Only a leading opener may be cut.
  it('does not strip an opener word from inside a title', () => {
    expect(parseTask('add sugar to the shopping list').title).toBe('Sugar to the shopping list');
    expect(parseTask('remember to add milk').title).toBe('Remember to add milk');
  });

  it('recognises each way of saying daily', () => {
    for (const s of ['water the plants every day', 'water the plants daily', 'water the plants each day']) {
      expect(parseTask(s).type).toBe('daily');
    }
  });

  it('recognises habits and one-offs', () => {
    expect(parseTask('stretch, habit').type).toBe('habit');
    expect(parseTask('fix the shelf, one-off').type).toBe('todo');
  });

  it('maps every difficulty word, and difficult onto hard', () => {
    expect(parseTask('run 10k, hard').difficulty).toBe('hard');
    expect(parseTask('run 10k, very hard').difficulty).toBe('hard');
    expect(parseTask('write the essay, difficult').difficulty).toBe('hard');
    expect(parseTask('tidy the desk, medium').difficulty).toBe('medium');
    expect(parseTask('open the post, trivial').difficulty).toBe('trivial');
    expect(parseTask('open the post, tiny').difficulty).toBe('trivial');
  });

  it('leaves no dangling punctuation where a cue was cut out', () => {
    expect(parseTask('drink water, daily, easy').title).toBe('Drink water');
    expect(parseTask('daily, stretch').title).toBe('Stretch');
  });

  // The parser must never produce an empty title — an unnamed task is a bug
  // you can only see after it is saved.
  it('falls back to the transcript rather than saving an empty title', () => {
    expect(parseTask('daily').title).toBe('daily');
    expect(parseTask('easy').title).toBe('easy');
  });

  it('never returns a blank title for any input', () => {
    const cases = ['daily easy', 'add', 'habit', 'hello there', 'a', 'add a task'];
    for (const c of cases) expect(parseTask(c).title.trim().length).toBeGreaterThan(0);
  });
});
