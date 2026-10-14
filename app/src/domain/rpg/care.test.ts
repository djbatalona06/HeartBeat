import { describe, expect, it } from 'vitest';
import {
  FAVOURITE_FOOD, FEED_KINDS, FOOD, PANTRY_DAYS, RITUALS, RITUAL_KINDS,
  appetiteOf, canFeed, careCaption, describeFeed, earnedFood, favouriteFor, feedActId,
  feedsNewestFirst, foodKey, gotFavourite, keyOfFeed, pantryOf, ritualActId, ritualStates,
  togetherCareDays,
  type CareAct, type FoodItem,
} from './care';

const ME = 'me';
const THEM = 'them';
const TODAY = '2026-10-14';
const YESTERDAY = '2026-10-13';
const AT = 1_700_000_000_000;

function feed(item: FoodItem, by: string, over: Partial<CareAct> = {}): CareAct {
  return {
    id: feedActId(item, by), coupleId: 'c1', memberId: by, kind: item.kind,
    day: TODAY, earnerId: item.earnerId, earnedDay: item.earnedDay,
    createdAt: AT, updatedAt: AT, ...over,
  };
}

function ritual(kind: 'pet' | 'play' | 'rest', by: string, day = TODAY): CareAct {
  return {
    id: ritualActId(kind, day, by), coupleId: 'c1', memberId: by, kind, day,
    createdAt: AT, updatedAt: AT,
  };
}

const MEAL: FoodItem = {
  key: foodKey('meal', ME, TODAY), kind: 'meal', earnerId: ME, earnedDay: TODAY,
};

describe('what logging earns', () => {
  it('turns "ate well" into a meal, "grateful" into a treat and a workout into a snack', () => {
    const items = earnedFood(
      [{ memberId: ME, day: TODAY, ateWell: true, grateful: true }],
      [{ memberId: THEM, day: TODAY }],
      TODAY,
    );
    expect(items.map((i) => `${i.kind}:${i.earnerId}`).sort())
      .toEqual(['meal:me', 'snack:them', 'treat:me']);
  });

  it('earns nothing from a mood that ticked nothing', () => {
    expect(earnedFood([{ memberId: ME, day: TODAY }], [], TODAY)).toEqual([]);
  });

  it('counts a day logged twice once, so a replayed sync cannot double the pantry', () => {
    const mood = { memberId: ME, day: TODAY, ateWell: true };
    expect(earnedFood([mood, mood], [], TODAY)).toHaveLength(1);
  });

  it('keeps yesterday in the pantry and lets the day before go', () => {
    const items = earnedFood(
      [
        { memberId: ME, day: YESTERDAY, ateWell: true },
        { memberId: ME, day: '2026-10-12', ateWell: true },
      ],
      [],
      TODAY,
    );
    expect(PANTRY_DAYS).toBe(2);
    expect(items.map((i) => i.earnedDay)).toEqual([YESTERDAY]);
  });

  it('ignores a day in the future, as a phone with a wrong clock would send', () => {
    expect(earnedFood([{ memberId: ME, day: '2026-10-20', ateWell: true }], [], TODAY)).toEqual([]);
  });

  it('is the same list from the same logs in any order', () => {
    const moods = [
      { memberId: ME, day: TODAY, ateWell: true },
      { memberId: THEM, day: TODAY, grateful: true },
    ];
    expect(earnedFood(moods, [], TODAY)).toEqual(earnedFood([...moods].reverse(), [], TODAY));
  });
});

describe('the pantry', () => {
  it('holds an item until an act eats it', () => {
    expect(pantryOf([MEAL], [])).toEqual([MEAL]);
    expect(pantryOf([MEAL], [feed(MEAL, ME)])).toEqual([]);
  });

  it('lets a partner feed the item you earned', () => {
    const act = feed(MEAL, THEM);
    expect(canFeed(MEAL, [])).toEqual({ ok: true });
    expect(act.memberId).toBe(THEM);
    expect(act.earnerId).toBe(ME);
    expect(pantryOf([MEAL], [act])).toEqual([]);
  });

  /**
   * The convergence property. Both phones feed the same item at once and write
   * two rows with two ids (the feeder is in the id, because a holdings row has
   * one writer for life) -- and the pantry must still read one eaten item.
   */
  it('reads two phones feeding the same item as one eaten item', () => {
    const both = [feed(MEAL, ME), feed(MEAL, THEM)];
    expect(feed(MEAL, ME).id).not.toBe(feed(MEAL, THEM).id);
    expect(pantryOf([MEAL], both)).toEqual([]);
    const other: FoodItem = { ...MEAL, key: foodKey('snack', ME, TODAY), kind: 'snack' };
    expect(pantryOf([MEAL, other], both)).toEqual([other]);
  });

  it('refuses an item already eaten, gently', () => {
    const check = canFeed(MEAL, [feed(MEAL, THEM)]);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).not.toMatch(/fail|error|wrong/i);
  });

  it('ignores a ritual when it asks what has been eaten', () => {
    expect(pantryOf([MEAL], [ritual('pet', ME)])).toEqual([MEAL]);
    expect(keyOfFeed(ritual('pet', ME))).toBeUndefined();
  });

  it('derives the same act id for the same tap, so a double tap is one row', () => {
    expect(feedActId(MEAL, ME)).toBe(feedActId({ ...MEAL }, ME));
  });
});

describe('saying who fed what', () => {
  const mine = feed(MEAL, ME);
  const theirsFedMine = feed(MEAL, THEM);
  const snackOfTheirs: FoodItem = {
    key: foodKey('snack', THEM, TODAY), kind: 'snack', earnerId: THEM, earnedDay: TODAY,
  };

  it('names all four cases from the viewer\'s side', () => {
    expect(describeFeed(mine, ME)).toBe('You fed it a proper meal.');
    expect(describeFeed(feed(snackOfTheirs, ME), ME)).toBe('You fed it a snack they had earned.');
    expect(describeFeed(feed(snackOfTheirs, THEM), ME)).toBe('They fed it a snack.');
    expect(describeFeed(theirsFedMine, ME)).toBe('They fed it a proper meal you had earned.');
  });

  it('says nothing for a ritual', () => {
    expect(describeFeed(ritual('pet', ME), ME)).toBeUndefined();
  });

  it('orders the newest first and leaves rituals out', () => {
    const older = feed(MEAL, ME, { createdAt: AT });
    const newer = feed(MEAL, THEM, { createdAt: AT + 5 });
    expect(feedsNewestFirst([older, ritual('pet', ME), newer])).toEqual([newer, older]);
  });
});

describe('appetite is never sad', () => {
  it('is peckish until something is fed today, then fed', () => {
    expect(appetiteOf([], TODAY)).toBe('peckish');
    expect(appetiteOf([feed(MEAL, ME, { day: YESTERDAY })], TODAY)).toBe('peckish');
    expect(appetiteOf([feed(MEAL, ME)], TODAY)).toBe('fed');
  });

  it('has no word for hungry or starving anywhere in its copy', () => {
    const lines = [
      careCaption('peckish', 0, false), careCaption('fed', 0, false),
      careCaption('fed', 1, false), careCaption('fed', 0, true),
    ];
    for (const line of lines) expect(line).not.toMatch(/hungry|starv|neglect|sad|guilt|miss/i);
  });
});

describe('favourites', () => {
  it('gives every food a name, a phrase and a way to earn it', () => {
    for (const kind of FEED_KINDS) {
      expect(FOOD[kind].name).toBeTruthy();
      expect(FOOD[kind].phrase).toBeTruthy();
      expect(FOOD[kind].earnedBy).toBeTruthy();
    }
  });

  it('only names foods that exist, and falls back to a meal for an unknown mascot', () => {
    for (const kind of Object.values(FAVOURITE_FOOD)) expect(FEED_KINDS).toContain(kind);
    expect(favouriteFor('not-a-mascot')).toBe('meal');
    expect(favouriteFor(undefined)).toBe('meal');
  });

  it('notices the favourite only when it was fed today', () => {
    const treat: FoodItem = { ...MEAL, key: foodKey('treat', ME, TODAY), kind: 'treat' };
    expect(gotFavourite([feed(treat, ME)], TODAY, 'pony')).toBe(true);
    expect(gotFavourite([feed(MEAL, ME)], TODAY, 'pony')).toBe(false);
    expect(gotFavourite([feed(treat, ME, { day: YESTERDAY })], TODAY, 'pony')).toBe(false);
  });
});

describe('the rituals', () => {
  it('are pet, play and rest, each once per person per day by construction', () => {
    expect(RITUAL_KINDS).toEqual(['pet', 'play', 'rest']);
    expect(RITUALS.map((r) => r.id)).toEqual([...RITUAL_KINDS]);
    expect(ritualActId('pet', TODAY, ME)).toBe(ritualActId('pet', TODAY, ME));
    expect(ritualActId('pet', TODAY, ME)).not.toBe(ritualActId('pet', TODAY, THEM));
    expect(ritualActId('pet', TODAY, ME)).not.toBe(ritualActId('pet', YESTERDAY, ME));
  });

  it('marks mine, and lists who has done each', () => {
    const states = ritualStates([ritual('pet', ME), ritual('play', THEM)], TODAY, ME, [ME, THEM]);
    const byId = Object.fromEntries(states.map((s) => [s.ritual.id, s]));
    expect(byId.pet.mine).toBe(true);
    expect(byId.play.mine).toBe(false);
    expect(byId.play.doneBy).toEqual([THEM]);
    expect(byId.rest.doneBy).toEqual([]);
  });

  it('answers together only when both of you did the same one today', () => {
    const acts = [ritual('pet', ME), ritual('pet', THEM), ritual('play', ME)];
    const states = ritualStates(acts, TODAY, ME, [ME, THEM]);
    expect(states.find((s) => s.ritual.id === 'pet')!.together).toBe(true);
    expect(states.find((s) => s.ritual.id === 'play')!.together).toBe(false);
  });

  it('never reads a solo phone as together', () => {
    const states = ritualStates([ritual('pet', ME)], TODAY, ME, [ME]);
    expect(states.every((s) => !s.together)).toBe(true);
  });

  it('does not carry yesterday into today', () => {
    const states = ritualStates([ritual('pet', ME, YESTERDAY)], TODAY, ME, [ME, THEM]);
    expect(states.find((s) => s.ritual.id === 'pet')!.mine).toBe(false);
  });
});

describe('days you cared together', () => {
  it('counts a day only when two different people did something', () => {
    const acts = [
      ritual('pet', ME), ritual('play', ME),
      ritual('pet', ME, YESTERDAY), ritual('rest', THEM, YESTERDAY),
    ];
    expect(togetherCareDays(acts)).toBe(1);
  });

  it('counts feeding as caring, including feeding for each other', () => {
    expect(togetherCareDays([feed(MEAL, THEM), ritual('rest', ME)])).toBe(1);
  });

  it('only ever grows as acts are added', () => {
    const base = [ritual('pet', ME), ritual('pet', THEM)];
    expect(togetherCareDays([...base, ritual('pet', ME, YESTERDAY)])).toBeGreaterThanOrEqual(
      togetherCareDays(base),
    );
  });
});
