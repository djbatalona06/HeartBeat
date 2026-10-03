import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GEAR } from '../../../domain/rpg/gear';
import { PET_KINDS } from '../../../domain/rpg/pets';
import { FURNITURE } from '../../../domain/rpg/furniture';
import { COSTUMES } from '../../../domain/rpg/costumes';
import { costumeArt } from './costumes';
import { gearArt } from './gear';
import { petArt } from './pets';
import { houseArt } from './house';

/**
 * All three registries throw at import time if the catalogue outruns the art,
 * so merely importing them here is most of this test. What is left is making
 * that exercised in CI rather than only the first time a screen happens to
 * import one — and confirming the lookup actually resolves per id, not just
 * that the module loaded without throwing.
 *
 * `houseArt` was the one missing from this walk. Its own import-time throw was
 * therefore reached only when somebody opened the Birb tab in a browser, which
 * means a piece of furniture added without a drawing shipped green and broke a
 * screen. It is here now, for the same reason the other two are.
 */
describe('gear art', () => {
  it('draws every item in the catalogue', () => {
    for (const item of GEAR) expect(gearArt(item.id), item.id).toBeDefined();
  });

  it('has nothing for an id that does not exist', () => {
    expect(gearArt('not-a-real-item')).toBeUndefined();
  });
});

describe('pet art', () => {
  it('draws every kind in the catalogue', () => {
    for (const kind of PET_KINDS) expect(petArt(kind.id), kind.id).toBeDefined();
  });

  it('has nothing for a kind that does not exist', () => {
    expect(petArt('not-a-real-kind')).toBeUndefined();
  });
});

describe('house art', () => {
  it('draws every piece in the catalogue', () => {
    for (const piece of FURNITURE) expect(houseArt(piece.id), piece.id).toBeDefined();
  });

  it('has nothing for a piece that does not exist', () => {
    expect(houseArt('decor-not-a-real-piece')).toBeUndefined();
    expect(houseArt(undefined)).toBeUndefined();
  });
});

describe('costume art', () => {
  it('draws every costume in the catalogue', () => {
    for (const costume of COSTUMES) expect(costumeArt(costume.id), costume.id).toBeDefined();
  });

  it('has nothing for a costume that does not exist', () => {
    expect(costumeArt('costume-not-a-real-one')).toBeUndefined();
    expect(costumeArt(undefined)).toBeUndefined();
  });

  // A dye sets exactly these three custom properties on the bird's wrapper, and
  // a costume sits inside that wrapper. A drawing that read any of them would
  // be recoloured by every dye, which is the mixing this separation exists to
  // prevent.
  it('never paints in a colour a dye sets', () => {
    const source = readFileSync(resolve(__dirname, 'costumes/index.tsx'), 'utf8');
    for (const forbidden of ['--color-text', '--color-accent', '--color-text-muted']) {
      expect(source, forbidden).not.toContain(`var(${forbidden}`);
    }
    expect(source).toContain('var(--costume-main)');
    expect(source).toContain('var(--costume-trim)');
  });
});
