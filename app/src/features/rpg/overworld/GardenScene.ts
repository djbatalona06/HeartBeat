import Phaser from 'phaser';
import { SPRITE_SIZE } from '../../../domain/rpg/sprites';
import {
  TILE, isWalkable, spotAt, tileAt, zoneHeight, zoneWidth, type Zone,
} from '../../../domain/rpg/zones';
import { bakeAll } from './bake';

/**
 * The garden, walkable.
 *
 * ## No physics engine, and no pathfinding
 *
 * The bird occupies a tile, not a position. A move is a 140 ms tween to the
 * next tile, refused before it starts if `isWalkable` says no — so the grid in
 * `zones.ts` is the single authority on where the bird can be, and there is no
 * second collision model that could disagree with it. That removes the arcade
 * physics config, the bodies, the colliders and the per-frame overlap checks.
 *
 * EasyStar.js is not here either. Pathfinding earns its place when something
 * chooses its own route — click-to-move, or a creature that chases — and the
 * slice has neither: the three foes stand still, and the bird goes where the
 * key says. Adding a solver to walk one tile would be a dependency to explain.
 *
 * ## Talking to React
 *
 * One callback, handed in at construction. When the bird steps onto a tile with
 * something on it, the scene calls `onEncounter(enemyId)` and pauses itself; the
 * overlay closes by calling `resume()`. That is the whole protocol — see
 * `game.ts` for why it is not an event bus.
 */

export interface GardenHooks {
  onEncounter(enemyId: string): void;
}

const STEP_MS = 140;

export class GardenScene extends Phaser.Scene {
  static readonly KEY = 'garden';

  private readonly zone: Zone;
  private readonly hooks: GardenHooks;
  /** Enemies already beaten this visit, so one win does not re-trigger. */
  private readonly cleared = new Set<string>();

  private bird!: Phaser.GameObjects.Image;
  private tile = { x: 0, y: 0 };
  private moving = false;
  /** Named `zoom` because Phaser's Scene already owns `scale` (its ScaleManager). */
  private zoom = 3;

  constructor(zone: Zone, hooks: GardenHooks) {
    super(GardenScene.KEY);
    this.zone = zone;
    this.hooks = hooks;
  }

  /** Mark an enemy beaten, so stepping back onto its tile does not re-open it. */
  clear(enemyId: string): void {
    this.cleared.add(enemyId);
  }

  preload(): void {
    // Nothing is fetched. Every texture is drawn from the character grids in
    // `domain/rpg/sprites.ts`, in the palette the app is currently wearing.
    const baked = bakeAll(this.game.canvas.parentElement ?? document.body, this.zoom);
    for (const [key, canvas] of baked) {
      if (this.textures.exists(key)) this.textures.remove(key);
      this.textures.addCanvas(key, canvas);
    }
  }

  create(): void {
    const size = SPRITE_SIZE * this.zoom;
    const width = zoneWidth(this.zone);
    const height = zoneHeight(this.zone);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const kind = tileAt(this.zone, x, y);
        if (!kind) continue;
        this.add.image(x * size, y * size, kind.sprite).setOrigin(0, 0);
      }
    }

    for (const spot of this.zone.spots) {
      this.add.image(spot.x * size, spot.y * size, spot.enemyId)
        .setOrigin(0, 0)
        .setName(spot.enemyId);
    }

    this.tile = { ...this.zone.spawn };
    this.bird = this.add
      .image(this.tile.x * size, this.tile.y * size, 'bird-up')
      .setOrigin(0, 0)
      .setDepth(10);

    this.cameras.main.setBounds(0, 0, width * size, height * size);
    this.cameras.main.startFollow(this.bird, true, 0.1, 0.1);

    this.input.keyboard?.on('keydown', this.onKey, this);
    // Tap or click a tile next to the bird to step onto it — the phone control,
    // and the reason there is no on-screen d-pad to lay out.
    this.input.on('pointerdown', this.onPointer, this);
  }

  /** Step one tile, if that tile exists and nothing solid is on it. */
  step(dx: number, dy: number): void {
    if (this.moving) return;
    const next = { x: this.tile.x + dx, y: this.tile.y + dy };

    const facing = dy < 0 ? 'bird-up' : dy > 0 ? 'bird-down' : dx < 0 ? 'bird-left' : 'bird-right';
    this.bird.setTexture(facing);

    if (!isWalkable(this.zone, next.x, next.y)) return;

    const size = SPRITE_SIZE * this.zoom;
    this.moving = true;
    this.tweens.add({
      targets: this.bird,
      x: next.x * size,
      y: next.y * size,
      duration: STEP_MS,
      onComplete: () => {
        this.tile = next;
        this.moving = false;
        this.arriveAt(next.x, next.y);
      },
    });
  }

  private arriveAt(x: number, y: number): void {
    const spot = spotAt(this.zone, x, y);
    if (!spot || this.cleared.has(spot.enemyId)) return;
    // Pause before handing over, so the world is visibly still behind the
    // overlay rather than continuing to tween under it.
    this.scene.pause();
    this.hooks.onEncounter(spot.enemyId);
  }

  private onKey(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowUp': case 'w': case 'W': this.step(0, -1); break;
      case 'ArrowDown': case 's': case 'S': this.step(0, 1); break;
      case 'ArrowLeft': case 'a': case 'A': this.step(-1, 0); break;
      case 'ArrowRight': case 'd': case 'D': this.step(1, 0); break;
      default: return;
    }
    event.preventDefault();
  }

  /** A tap steps one tile towards wherever was tapped. */
  private onPointer(pointer: Phaser.Input.Pointer): void {
    const size = SPRITE_SIZE * this.zoom;
    const tx = Math.floor(pointer.worldX / size);
    const ty = Math.floor(pointer.worldY / size);
    const dx = tx - this.tile.x;
    const dy = ty - this.tile.y;
    if (dx === 0 && dy === 0) return;
    // One axis at a time, the larger gap first, so a diagonal tap still moves.
    if (Math.abs(dx) >= Math.abs(dy)) this.step(Math.sign(dx), 0);
    else this.step(0, Math.sign(dy));
  }
}

/** Pixels a tile takes on screen, for sizing the host element. */
export function tileScreenSize(scale: number): number {
  return SPRITE_SIZE * scale;
}

/** The grid's own tile size, re-exported so callers need one import. */
export { TILE };
