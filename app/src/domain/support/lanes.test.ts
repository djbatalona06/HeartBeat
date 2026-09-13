import { describe, expect, it } from 'vitest';
import { SUPPORT_LANES, lanesFor, type SupportLane } from './lanes';
import type { Gender } from '../types';

const base = { gender: undefined as Gender | undefined, tracksCycle: false, partnerTracksCycle: false };

describe('lanesFor', () => {
  /**
   * The rule the whole module exists for. Cycle content follows the tracking
   * flag — a thing the person said about themselves on this device — and never
   * the gender, which is not a claim about whether anybody has periods.
   */
  it('gives cycle content to whoever tracks a cycle, whatever they answered', () => {
    for (const gender of [undefined, 'male', 'female', 'other', 'unstated'] as const) {
      expect(lanesFor({ ...base, gender, tracksCycle: true }), String(gender))
        .toContain('cycle-self');
    }
  });

  it('never adds or removes a cycle lane on the strength of a gender alone', () => {
    for (const gender of [undefined, 'male', 'female', 'other', 'unstated'] as const) {
      expect(lanesFor({ ...base, gender }), String(gender)).not.toContain('cycle-self');
      expect(lanesFor({ ...base, gender }), String(gender)).not.toContain('cycle-partner');
    }
  });

  /**
   * Two women who both track a cycle. Handled by the general rule rather than
   * a special case, which is the point of keying off tracking: each of them is
   * both the person having a rough day and the person helping with one.
   */
  it('gives both cycle lanes when both of them track one', () => {
    const lanes = lanesFor({ gender: 'female', tracksCycle: true, partnerTracksCycle: true });
    expect(lanes).toContain('cycle-self');
    expect(lanes).toContain('cycle-partner');
  });

  it('gives only the partner lane to someone supporting a tracker', () => {
    const lanes = lanesFor({ ...base, gender: 'male', partnerTracksCycle: true });
    expect(lanes).toContain('cycle-partner');
    expect(lanes).not.toContain('cycle-self');
  });

  it("offers men's health to men and to nobody else", () => {
    for (const gender of [undefined, 'female', 'other', 'unstated'] as const) {
      expect(lanesFor({ ...base, gender }), String(gender)).not.toContain('mens-health');
    }
    expect(lanesFor({ ...base, gender: 'male' })).toContain('mens-health');
  });

  /**
   * "Prefer not to say" is an answer, not a penalty: it lands on the lane that
   * is for everybody rather than on a stripped-down version of the screen.
   */
  it('leaves someone who would rather not say with the general lane', () => {
    expect(lanesFor({ ...base, gender: 'unstated' })).toEqual(['general']);
    expect(lanesFor({ ...base, gender: undefined })).toEqual(['general']);
  });

  it('always ends on general, so no configuration is an empty screen', () => {
    const configs = [true, false].flatMap((tracksCycle) =>
      [true, false].flatMap((partnerTracksCycle) =>
        ([undefined, 'male', 'female', 'other', 'unstated'] as const).map((gender) =>
          ({ gender, tracksCycle, partnerTracksCycle })),
      ),
    );
    for (const config of configs) {
      const lanes = lanesFor(config);
      expect(lanes.length, JSON.stringify(config)).toBeGreaterThan(0);
      expect(lanes[lanes.length - 1], JSON.stringify(config)).toBe('general');
    }
  });

  it('never repeats a lane', () => {
    const lanes = lanesFor({ gender: 'male', tracksCycle: true, partnerTracksCycle: true });
    expect(new Set(lanes).size).toBe(lanes.length);
  });

  it('only ever returns lanes the content tables know about', () => {
    const known = new Set<SupportLane>(SUPPORT_LANES);
    for (const lane of lanesFor({ gender: 'male', tracksCycle: true, partnerTracksCycle: true })) {
      expect(known.has(lane), lane).toBe(true);
    }
  });
});
