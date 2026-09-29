import { RADIANCE_FLOOR, RADIANCE_FULL, type Vitals } from '../../domain/rpg/vitals';

/** The glow, as 0..1, for whatever is being dimmed by it. */
export function glowOf(vitals: Vitals): number {
  return (vitals.radiance - RADIANCE_FLOOR) / (RADIANCE_FULL - RADIANCE_FLOOR);
}
