import { isClosed } from './engine/client';

/**
 * What went wrong in the garden, and whether the couple can still play.
 *
 * ## Why this exists
 *
 * The page used to carry one `note: string | null` written from three places,
 * two of which swallowed their error entirely:
 *
 * ```ts
 * game.progress(petXp).then(…).catch(() => {});   // silent
 * game.stage(island, stage, theme).then(…).catch(() => {});   // silent
 * ```
 *
 * That second one is the whole bug. `sprite` is `monster?.spriteKey`, and
 * `sprite` gates the Phaser mount — so a rejected `stage()` left `monster` null,
 * left `sprite` undefined, and the canvas **never mounted at all**. The page
 * rendered an empty `.garden-stage` with no note and no `aria-busy`, which is
 * pixel-for-pixel what "still loading" looks like. Forever.
 *
 * The engine's own boot failure *was* reported, which is why this read as
 * intermittent rather than broken: lose the whole runtime and you got a
 * sentence, lose one call and you got nothing.
 *
 * ## Why it is a module and not four `useState`s
 *
 * Vitest runs in `environment: 'node'` and never sees a `.tsx` file, so a rule
 * that lives in a component is a rule with no test. The mapping from "which
 * call failed" to "what the couple can still do" is the part worth pinning, so
 * it lives here as plain functions over a string union and `fault.test.ts`
 * walks all four.
 */

/**
 * Which call failed, named by what it costs rather than by what threw.
 *
 * - `gate` — the Raid Gate would not open. Nothing past it exists yet, so this
 *   is the earliest thing that can fail. It is a repository read rather than an
 *   engine call, and it is here because it fails the same way and costs the
 *   same thing: before this existed, a rejected `openRaidGate` left `gate` null
 *   and the screen waiting on it forever.
 * - `engine` — the WebAssembly runtime never woke. No rules, so no fight.
 * - `stage` — the runtime is up but would not say what stands on this stage.
 *   Also covers `progress`, because both mean "answering, but not with what
 *   this screen needs".
 * - `scene` — the engine is fine and the Phaser chunk is not. The fight is
 *   entirely playable; only the picture is missing.
 * - `round` — one action did not land. Nothing is broken.
 */
export type GardenFault = 'gate' | 'engine' | 'stage' | 'scene' | 'round';

/**
 * A rejection, as a fault — or `null` when it was our own teardown.
 *
 * `close()` rejects everything outstanding when the page unmounts, and a user
 * who navigated away should not be shown an error about it. `isClosed` is the
 * existing predicate for exactly that and is reused rather than re-spelled.
 */
export function faultFrom(source: GardenFault, error: unknown): GardenFault | null {
  return isClosed(error) ? null : source;
}

/**
 * True when there is nothing to play and the only honest move is to retry.
 *
 * Both of these mean the C# side never handed over a monster, so there is no
 * fight to render in a canvas *or* in text. Anything else leaves the garden
 * standing.
 */
export function blocksPlay(fault: GardenFault | null): boolean {
  return fault === 'gate' || fault === 'engine' || fault === 'stage';
}

/**
 * True when the canvas cannot be had but the fight can.
 *
 * `BattleLog` and `ActionBar` are already pure DOM with no Phaser import — the
 * rule in `scene/events.ts` that nothing in `scene/` may import `engine/` is
 * what makes that true — and `BattleLog` is already rendered unconditionally.
 * So "the picture failed" costs the picture and nothing else.
 */
export function needsTextMode(fault: GardenFault | null): boolean {
  return fault === 'scene';
}

/** What a fault says out loud. */
export interface FaultCopy {
  title: string;
  body: string;
  /** Whether trying again could plausibly help. */
  retry: boolean;
}

/**
 * The words.
 *
 * Kept here beside the rule so the two cannot drift, and written to the same
 * posture as the rest of the app: nothing here blames the couple for a failure
 * that is the app's, and every one of them says what is *still true* rather
 * than only what is missing. `domain/notify/schedule.ts` argues the same line
 * about reminders — an app that scolds you is the thing `docs/DESIGN.md` says
 * not to build.
 */
export function faultCopy(fault: GardenFault): FaultCopy {
  switch (fault) {
    case 'gate':
      return {
        title: 'The gate would not open.',
        body: 'Eve’s Garden could not be reached just now. Nothing you have logged is affected.',
        retry: true,
      };
    case 'engine':
      return {
        title: 'The garden is still waking up.',
        body: 'It needs one visit online before it can open offline. Everything you have logged is safe on this phone.',
        retry: true,
      };
    case 'stage':
      return {
        title: 'This corner of the garden is quiet.',
        body: 'The path here did not load. Nothing you have logged is affected — try again in a moment.',
        retry: true,
      };
    case 'scene':
      return {
        title: 'Showing the garden in words.',
        body: 'The picture did not load, so the log below is standing in for it. Everything still works.',
        retry: true,
      };
    case 'round':
      return {
        title: 'That move did not land.',
        body: 'The garden is still here, and so is everything you logged.',
        retry: false,
      };
  }
}
