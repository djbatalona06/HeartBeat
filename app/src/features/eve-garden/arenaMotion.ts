/** Ambient shimmer is decorative and only accompanies the rendered 3D floor. */
export function shouldAnimateArena(calm: boolean, hasThreeDimensionalFloor: boolean): boolean {
  return !calm && hasThreeDimensionalFloor;
}
