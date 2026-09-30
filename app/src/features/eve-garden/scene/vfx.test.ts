import { describe, expect, it } from 'vitest';
import {
  DRAWN_MOVES, FALLBACK_SHAPE, KNOWN_VFX, MEND_VFX, MOVE_VFX, moveVfxFor, shapeFor,
} from './vfx';
import { COMPANION_KITS, MOVE_KEYS, skillsOf } from '../../../domain/rpg/companionSkills';

/**
 * The join between the kits and the drawings. Two lists in two directories
 * that have to agree, and nothing but a test holds them together — which is
 * exactly the shape the gear and pet art registries already have.
 */
describe('skill pictures', () => {
  it('knows a shape for every skill any companion can cast', () => {
    for (const kit of COMPANION_KITS) {
      for (const skill of skillsOf(kit)) {
        expect(KNOWN_VFX, `${kit.themeId} ${skill.id}`).toContain(skill.vfx);
      }
    }
  });

  it('has no picture for a skill nobody casts', () => {
    const cast = new Set(COMPANION_KITS.flatMap(skillsOf).map((skill) => skill.vfx));
    for (const vfx of KNOWN_VFX) {
      expect(cast.has(vfx), `${vfx} is mapped but never cast`).toBe(true);
    }
  });

  it('still draws something for a key it has never seen', () => {
    expect(shapeFor('a-skill-from-the-future')).toBe(FALLBACK_SHAPE);
    expect(shapeFor(undefined)).toBe(FALLBACK_SHAPE);
  });

  /** Five motions, and every one of them in use — an unused shape is dead
   *  animation code, which is dead code that also has to look right. */
  it('uses all five motions across the roster', () => {
    const used = new Set(COMPANION_KITS.flatMap(skillsOf).map((s) => shapeFor(s.vfx)));
    expect(used.size).toBe(5);
  });

  it('gives a signature and its support skill different motions', () => {
    for (const kit of COMPANION_KITS) {
      expect(shapeFor(kit.signature.vfx), kit.themeId)
        .not.toBe(shapeFor(kit.support.vfx));
    }
  });
});

describe('move pictures', () => {
  it('draws every kit × move, and nothing for a kit or move that does not exist', () => {
    const kits = COMPANION_KITS.map((k) => k.themeId);
    expect(Object.keys(MOVE_VFX).sort()).toEqual([...kits].sort());
    for (const kit of kits) {
      expect(Object.keys(MOVE_VFX[kit]).sort(), kit).toEqual([...DRAWN_MOVES].sort());
    }
    for (const move of DRAWN_MOVES) expect(MOVE_KEYS).toContain(move);
  });

  it('never gives two companions the same shape and colour for one move', () => {
    for (const move of DRAWN_MOVES) {
      const pairs = Object.values(MOVE_VFX).map((kit) => `${kit[move].shape}/${kit[move].token}`);
      expect(new Set(pairs).size, move).toBe(pairs.length);
    }
  });

  it('gives each kit three different motions, so a guard never reads as a hit', () => {
    for (const [kit, moves] of Object.entries(MOVE_VFX)) {
      expect(new Set(DRAWN_MOVES.map((m) => moves[m].shape)).size, kit).toBe(3);
    }
  });

  it('keeps mend a rising heal for everyone, and a missing kit on the plain spark', () => {
    expect(moveVfxFor('pony', 'mend')).toEqual(MEND_VFX);
    expect(MEND_VFX.shape).toBe('motes');
    expect(moveVfxFor('a-kit-from-the-future', 'physical')).toBeUndefined();
  });
});
