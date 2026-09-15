import Phaser from 'phaser';
import { SPRITE_SIZE } from '../../../domain/rpg/sprites';
import { ARENA_HEIGHT, ARENA_WIDTH } from '../../../domain/rpg/arena';
import { BattleGardenScene } from './BattleGardenScene';
import type { Blow, SceneHandle, SceneHooks } from './events';

/**
 * The only file in Eve's Garden that imports Phaser.
 *
 * Same job as `features/rpg/overworld/game.ts`, and kept as a separate file for
 * the same reason: the import has to sit in one place a page can reach with a
 * dynamic `import()`, so a megabyte of engine stays out of the home screen's
 * module graph and out of the service-worker precache. `vite.config.ts` pins
 * the chunk name `phaser` off the back of that.
 *
 * This is a second such file rather than a shared one. The two scenes want
 * different canvas sizes and different handles, and folding them together would
 * mean one module that imports both scenes — which would pull the old
 * overworld's code into Eve's Garden's chunk and vice versa, for no gain. They
 * go away together when the legacy route does.
 */

export interface StartOptions {
  island: number;
  stage: number;
  /** A `SpriteKey` from the C# monster, already resolved by the page. */
  monsterSprite: string;
  /** The mascot that came through the Raid Gate, from `spriteKeyForTheme`. */
  petSprite: string;
  /** Local hour, 0-23. Decides where the light is. */
  hour: number;
  /** True when the island is wearing its dark face. */
  dark: boolean;
}

export function startGarden(
  parent: HTMLElement,
  options: StartOptions,
  hooks: SceneHooks,
): SceneHandle {
  const scale = 3;
  const scene = new BattleGardenScene(
    options.island, options.stage, options.monsterSprite, options.petSprite,
    options.hour, options.dark, hooks,
  );

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: ARENA_WIDTH * SPRITE_SIZE * scale,
    height: ARENA_HEIGHT * SPRITE_SIZE * scale,
    // Nearest-neighbour, or 16x16 art scaled 3x turns to mush.
    pixelArt: true,
    // So `ThemeBackdrop` shows through and the five packs still read as themes.
    transparent: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [scene],
    // Arcade, and only for the combat sparks — see the header of
    // `BattleGardenScene`. Walking is grid-based and never touches a body.
    physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, debug: false } },
    // The page owns scrolling and the tab bar owns the bottom of the screen;
    // Phaser capturing the whole document's input would break both.
    input: { keyboard: true, mouse: true, touch: true },
    audio: { noAudio: true },
    banner: false,
  });

  /**
   * The scene is constructed before Phaser boots it, so a call that lands in
   * the first frame or two would reach a scene with no sprites. Every method
   * below goes through here and no-ops until `create()` has run, which is
   * cheaper than teaching each one to queue.
   */
  const live = (): BattleGardenScene | undefined => {
    const found = game.scene.getScene(BattleGardenScene.KEY) as BattleGardenScene | undefined;
    return found?.sys.isActive() ? found : undefined;
  };

  return {
    strike: (blow: Blow, effectiveness) => live()?.strike(blow, effectiveness) ?? Promise.resolve(),
    skill: (vfx: string) => live()?.skill(vfx) ?? Promise.resolve(),
    defeat: () => live()?.defeat() ?? Promise.resolve(),
    withdraw: () => live()?.withdraw(),
    relight: (hour, dark) => live()?.relight(hour, dark),
    // `loop.sleep()` rather than `scene.pause()`: it stops the game loop itself,
    // so the rAF callback and the physics step both stop rather than the scene
    // being skipped inside a loop that keeps running.
    pause: () => game.loop.sleep(),
    resume: () => game.loop.wake(),
    // `destroy(true)` removes the canvas and releases the WebGL context.
    // Leaving the context alive across route changes is how a phone runs out of
    // them after half a dozen navigations.
    destroy: () => game.destroy(true),
  };
}
