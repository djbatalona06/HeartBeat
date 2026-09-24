/**
 * The two directions across the React/Phaser boundary.
 *
 * `game.ts` in the old overworld argued that two function references beat an
 * event bus when there is one publisher and one subscriber four lines apart,
 * and that argument still holds — so this is not a bus. It is two typed
 * interfaces: what the scene tells the page, and what the page tells the scene.
 *
 * What changed is the direction of the traffic. The overworld only ever pushed
 * one way (the bird stepped on something, React opened an overlay). Eve's
 * Garden pushes both: React owns the fight, because React owns the worker, and
 * it has to tell the scene to play an animation for a turn the scene did not
 * decide.
 *
 * The one rule this boundary has: **Phaser never talks to the game worker.**
 * The scene is told what to draw. It does not know what a `BattleDto` is, which
 * is why nothing in `scene/` imports from `engine/`.
 */

/** What the scene tells the page. */
export interface SceneHooks {
  /** The pet walked into the monster. Open the fight. */
  onEngage(): void;
  /** The pet moved. Used to hide the hint once someone has worked out the controls. */
  onMove?(): void;
}

/** Which way a hit is going, and how it should look. */
export type Blow = 'player-hits' | 'monster-hits';

/**
 * What one step did. `busy` covers a tween still running, a fight open, and a
 * scene that has not finished booting — all three mean "try again in a moment".
 */
export type StepResult = 'moved' | 'blocked' | 'engaged' | 'busy';

/** What the page tells the scene. Every method is safe to call at any time. */
export interface SceneHandle {
  /** Play one exchange. Resolves when the animation is done. */
  strike(blow: Blow, effectiveness: 'weak' | 'plain' | 'strong'): Promise<void>;
  /**
   * Play a companion's skill, named by its `vfx` key.
   *
   * Deliberately takes the key rather than a shape: the scene owns the mapping
   * (`scene/vfx.ts`), so adding a skill needs no change on this boundary and
   * the domain never learns what a particle is. Resolves when it is done, so a
   * skill and the swing behind it can be paced apart rather than overlapping.
   */
  skill(vfx: string): Promise<void>;
  /** The monster is down: fade it out and leave the ground clear. */
  defeat(): Promise<void>;
  /** The fight ended without a win. Walk the pet back to its spawn tile. */
  withdraw(): void;
  /** Walk one tile — the on-screen pad's way in, beside the keys and the tap. */
  step(dx: number, dy: number): StepResult;
  /** Re-light the scene for a new hour or a changed diorama variant. */
  relight(hour: number, dark: boolean): void;
  /**
   * Stop and restart the render loop without losing the scene.
   *
   * For `visibilitychange`: a backgrounded tab kept a rAF loop and an Arcade
   * physics step running over a canvas nobody was looking at, which on a phone
   * is battery spent on nothing. Distinct from `destroy` on purpose — coming
   * back to a garden that had been torn down would mean re-reading the stage
   * and rebuilding the canvas, and the pet would jump back to its spawn tile
   * mid-walk.
   */
  pause(): void;
  resume(): void;
  /** Full teardown, including the WebGL context. */
  destroy(): void;
}
