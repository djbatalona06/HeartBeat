import { describe, expect, it } from 'vitest';
import { COSTUMES, COSTUME_PREFIX, costumeById, costumeStyle, isCostumeItem } from './costumes';
import { DYES } from './dyes';
import { GEAR } from './gear';
import { FURNITURE } from './furniture';
import { PURSES } from './coinSources';

describe('the costume catalogue', () => {
  it('has unique ids under its own prefix', () => {
    const ids = COSTUMES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(isCostumeItem(id)).toBe(true);
    expect(id0()).toMatch(new RegExp(`^${COSTUME_PREFIX}`));
  });

  it('shares no id with a dye, a piece of gear, furniture or a purse', () => {
    const others = new Set<string>([
      ...DYES.map((d) => d.id), ...GEAR.map((g) => g.id),
      ...FURNITURE.map((f) => f.id), ...PURSES.map((p) => p.id),
    ]);
    for (const costume of COSTUMES) expect(others.has(costume.id), costume.id).toBe(false);
  });

  it('is not for free, and never uses a dye\'s own colours', () => {
    const dyeColours = new Set(DYES.flatMap((d) => [d.ink, d.accent, d.muted].map((c) => c.toLowerCase())));
    for (const costume of COSTUMES) {
      expect(costume.price).toBeGreaterThan(0);
      expect(dyeColours.has(costume.main.toLowerCase()), costume.id).toBe(false);
    }
  });

  it('looks a costume up, and is total for one that is not there', () => {
    expect(costumeById(COSTUMES[0].id)).toBe(COSTUMES[0]);
    expect(costumeById('nope')).toBeUndefined();
    expect(costumeById(undefined)).toBeUndefined();
  });

  it('styles through its own two properties and none of the dye\'s', () => {
    const style = costumeStyle(COSTUMES[0].id);
    expect(Object.keys(style).sort()).toEqual(['--costume-main', '--costume-trim']);
    expect(costumeStyle(undefined)).toEqual({});
  });
});

function id0() { return COSTUMES[0].id; }
