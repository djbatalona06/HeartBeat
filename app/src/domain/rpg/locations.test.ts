import { describe, expect, it } from 'vitest';
import {
  PLACES,
  PLACE_PREFIX,
  canTravel,
  findAt,
  isNewTo,
  nextPlace,
  placeById,
  placesFor,
  travelCost,
} from './locations';

describe('the atlas', () => {
  it('repeats no id and no name', () => {
    expect(new Set(PLACES.map((p) => p.id)).size).toBe(PLACES.length);
    expect(new Set(PLACES.map((p) => p.name)).size).toBe(PLACES.length);
  });

  it('prefixes every id', () => {
    for (const p of PLACES) expect(p.id, p.name).toMatch(new RegExp(`^${PLACE_PREFIX}`));
  });

  it('opens somewhere at level 1, so there is never nowhere to go', () => {
    expect(PLACES.some((p) => p.unlockLevel <= 1)).toBe(true);
  });

  it('gets further, dearer and more rewarding in step', () => {
    // The ladder is the whole shape of the feature: if a nearer place paid
    // better, the far ones would be a worse choice dressed as a better one.
    for (let i = 1; i < PLACES.length; i += 1) {
      expect(PLACES[i].unlockLevel, PLACES[i].id).toBeGreaterThan(PLACES[i - 1].unlockLevel);
      expect(PLACES[i].surcharge, PLACES[i].id).toBeGreaterThanOrEqual(PLACES[i - 1].surcharge);
      expect(PLACES[i].bounty, PLACES[i].id).toBeGreaterThan(PLACES[i - 1].bounty);
    }
  });

  it('gives every place something to find', () => {
    for (const p of PLACES) {
      expect(p.finds.length, p.id).toBeGreaterThanOrEqual(2);
      for (const f of p.finds) expect(f.trim().length, p.id).toBeGreaterThan(0);
    }
  });
});

describe('placesFor', () => {
  it('opens up as the level rises', () => {
    expect(placesFor(1).length).toBeGreaterThanOrEqual(1);
    expect(placesFor(99).length).toBe(PLACES.length);
    expect(placesFor(1).length).toBeLessThan(placesFor(99).length);
  });

  it('never offers somewhere above the level', () => {
    for (const p of placesFor(5)) expect(p.unlockLevel, p.id).toBeLessThanOrEqual(5);
  });
});

describe('nextPlace', () => {
  it('names the one to look forward to', () => {
    expect(nextPlace(1)?.unlockLevel).toBeGreaterThan(1);
  });

  it('runs out once everywhere is open, rather than repeating the last', () => {
    expect(nextPlace(999)).toBeNull();
  });
});

describe('canTravel', () => {
  const garden = PLACES[0];
  const far = PLACES[PLACES.length - 1];

  it('lets you go somewhere open with the energy for it', () => {
    expect(canTravel(garden, 10, 50, 10)).toEqual({ ok: true });
  });

  it('refuses on level before it refuses on energy', () => {
    // Telling somebody to rest up for somewhere they cannot reach yet would
    // waste the rest. Level is the answer that is actually actionable.
    const verdict = canTravel(far, 1, 0, 10);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain(`level ${far.unlockLevel}`);
  });

  it('says how much more energy is needed, once the level is fine', () => {
    const verdict = canTravel(garden, 10, 3, 10);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain('more energy');
  });

  it('counts the surcharge as part of what has to be afforded', () => {
    const place = PLACES.find((p) => p.surcharge > 0)!;
    const base = 10;
    // Exactly the base cost is not enough once distance is added; one short of
    // the total still is not; the total is.
    expect(canTravel(place, 99, base, base).ok).toBe(false);
    expect(canTravel(place, 99, base + place.surcharge - 1, base).ok).toBe(false);
    expect(canTravel(place, 99, base + place.surcharge, base)).toEqual({ ok: true });
  });
});

describe('travelCost', () => {
  it('is the stage cost plus the distance', () => {
    const place = PLACES[PLACES.length - 1];
    expect(travelCost(place, 12)).toBe(12 + place.surcharge);
  });
});

describe('findAt', () => {
  const place = PLACES[0];

  it('picks by the roll it is handed, so a test can name the outcome', () => {
    expect(findAt(place, 0)).toBe(place.finds[0]);
    expect(findAt(place, 0.99)).toBe(place.finds[place.finds.length - 1]);
  });

  it('reaches every entry across the range rather than favouring one', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i += 1) seen.add(findAt(place, i / 100));
    expect(seen.size).toBe(place.finds.length);
  });

  it('clamps a roll outside 0–1 instead of returning undefined', () => {
    // The one caller passes `Math.random()`, and a crash on an adventure would
    // be a strange way to find out about a rounding error.
    expect(place.finds).toContain(findAt(place, 1));
    expect(place.finds).toContain(findAt(place, -5));
    expect(place.finds).toContain(findAt(place, Number.NaN));
  });
});

describe('isNewTo', () => {
  it('is true the first time and false after', () => {
    expect(isNewTo([], 'place-garden')).toBe(true);
    expect(isNewTo(undefined, 'place-garden')).toBe(true);
    expect(isNewTo(['place-garden'], 'place-garden')).toBe(false);
  });

  it('does not confuse one place for another', () => {
    expect(isNewTo(['place-canal'], 'place-garden')).toBe(true);
  });
});

describe('placeById', () => {
  it('finds one, and nothing for a place that does not exist', () => {
    expect(placeById('place-garden')?.name).toBe('The garden');
    expect(placeById('place-atlantis')).toBeUndefined();
    expect(placeById(undefined)).toBeUndefined();
  });
});
