import Phaser from 'phaser';
import type { Zone } from '../../../domain/rpg/zones';
import { SPRITE_SIZE } from '../../../domain/rpg/sprites';
import { zoneHeight, zoneWidth } from '../../../domain/rpg/zones';
import { GardenScene, type GardenHooks } from './GardenScene';

/**
 * The only file in the app that imports Phaser.
 *
 * It exists so the import is in one place that `OverworldPage` can reach with a
 * dynamic `import()`, which is what keeps a megabyte of engine out of the home
 * screen's module graph and out of the service-worker precache.
 *
 * ## Why the React boundary is two function references
 *
 * `startOverworld` takes an `onEncounter` callback and returns a handle with
 * `resume` and `destroy`. That is the whole protocol, and it is deliberately not
 * an event bus with named channels and Zod-validated payloads.
 *
 * An event bus buys decoupling between publishers and subscribers that do not
 * know about each other. Here there is one publisher and one subscriber,
 * constructed by the same `useEffect` four lines apart. Replacing a typed
 * function call — where the compiler proves the payload is a string and the
 * handler exists — with a stringly-typed channel and a runtime lookup that can
 * silently have no listener is strictly less safe and strictly more code.
 *
 * A Zod schema on the same boundary would be a test that can only pass: the
 * value is a `string` the compiler already typed, it came from `ZONES` in this
 * repository a few milliseconds earlier, and it crosses no network, no
 * `JSON.parse` and no storage layer. The one runtime guard that *is* needed is
 * already written — `enemyById` returns `undefined` for an unknown id and the
 * overlay renders nothing — which is the same total-function convention
 * `placeById` and `skillById` follow.
 */

export interface OverworldHandle {
  /** Un-pause the world after the overlay closes. */
  resume(): void;
  /** Tell the scene an enemy is beaten, so its tile stops re-opening. */
  markCleared(enemyId: string): void;
  /** Full teardown, including the WebGL context. */
  destroy(): void;
}

export function startOverworld(
  parent: HTMLElement,
  zone: Zone,
  hooks: GardenHooks,
): OverworldHandle {
  const scale = 3;
  const scene = new GardenScene(zone, hooks);

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: zoneWidth(zone) * SPRITE_SIZE * scale,
    height: zoneHeight(zone) * SPRITE_SIZE * scale,
    // Nearest-neighbour, or 16x16 art scaled 3x turns to mush.
    pixelArt: true,
    // So `ThemeBackdrop` shows through and the five packs still read as themes.
    transparent: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [scene],
    // The page owns scrolling and the tab bar owns the bottom of the screen;
    // Phaser capturing the whole document's input would break both.
    input: { keyboard: true, mouse: true, touch: true },
    audio: { noAudio: true },
    banner: false,
  });

  return {
    resume: () => {
      const live = game.scene.getScene(GardenScene.KEY);
      if (live) live.scene.resume();
    },
    markCleared: (enemyId: string) => {
      const live = game.scene.getScene(GardenScene.KEY) as GardenScene | undefined;
      live?.clear(enemyId);
    },
    // `destroy(true)` removes the canvas and releases the WebGL context. Leaving
    // the context alive across route changes is how a phone runs out of them
    // after half a dozen navigations.
    destroy: () => game.destroy(true),
  };
}
