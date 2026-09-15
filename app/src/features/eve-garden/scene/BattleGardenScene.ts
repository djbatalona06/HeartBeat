import Phaser from 'phaser';
import { SPRITE_SIZE } from '../../../domain/rpg/sprites';
import {
  ARENA_HEIGHT, ARENA_WIDTH, arenaFor, isAdjacentToMonster, isWalkable, tileKindAt,
  type Arena,
} from '../../../domain/rpg/arena';
import { lightingAt } from '../../../domain/rpg/diorama';
import { bakeAll } from '../../rpg/overworld/bake';
import { shapeFor } from './vfx';
import type { Blow, SceneHooks } from './events';

/**
 * One stage of Eve's Garden, drawn.
 *
 * The scene knows about ground, two sprites and some tweens. It does not know
 * what a monster's stats are, whose turn it is, or what an element chart is —
 * React owns the fight because React owns the worker, and it tells this scene
 * what to play. Nothing in this directory imports from `engine/`.
 *
 * ## Two movement models, on purpose
 *
 * **Walking is grid-based and physics-free**, exactly as `GardenScene` was. The
 * pet occupies a tile; a step is a tween to the next one, refused before it
 * starts if `isWalkable` says no. `arena.ts` is therefore the single authority
 * on where the pet can be, and there is no second collision model to disagree
 * with it.
 *
 * **Combat effects use Arcade Physics**, and only combat effects. A thrown
 * spark wants gravity, an initial velocity and a natural arc; writing that as
 * a tween means hand-integrating the arc, and hand-integrated arcs are how you
 * end up with a physics engine nobody named. The bodies here live for a few
 * hundred milliseconds and never touch the pet, the monster or the ground, so
 * the two models cannot contradict each other — which is the only reason
 * having both is safe.
 *
 * ## Lighting
 *
 * `diorama.ts` decides where the light is; this applies it as a tint and a
 * skewed shadow under each sprite. There is no WebGL light source, because a
 * 16x16 pixel garden gains nothing from one and it would cost the `transparent`
 * canvas that lets `ThemeBackdrop` show through.
 */

const STEP_MS = 140;
const STRIKE_MS = 400;
const HURT_MS = 300;
const DEFEAT_MS = 800;
/** How long a companion's skill holds the screen before the swing behind it. */
const SKILL_MS = 520;

/** How far a struck sprite is knocked, in pixels before scaling. */
const KNOCKBACK = 5;

export class BattleGardenScene extends Phaser.Scene {
  static readonly KEY = 'eve-garden';

  private readonly hooks: SceneHooks;
  private arena: Arena;
  private monsterSprite: string;
  /**
   * Whoever came through the Raid Gate. The player used to be `bird-right`
   * whatever had been chosen, which made the gate a menu that changed nothing
   * anybody could see.
   */
  private petSprite: string;
  private hour: number;
  private dark: boolean;

  private pet!: Phaser.GameObjects.Image;
  private foe!: Phaser.GameObjects.Image;
  private petShadow!: Phaser.GameObjects.Ellipse;
  private foeShadow!: Phaser.GameObjects.Ellipse;
  private sparks!: Phaser.Physics.Arcade.Group;

  private tile = { x: 0, y: 0 };
  private moving = false;
  /** True once the fight is open, so walking stops and strikes can play. */
  private engaged = false;
  private beaten = false;
  /** Named `zoom` because Phaser's Scene already owns `scale` (its ScaleManager). */
  private readonly zoom = 3;

  constructor(
    island: number,
    stage: number,
    monsterSprite: string,
    petSprite: string,
    hour: number,
    dark: boolean,
    hooks: SceneHooks,
  ) {
    super(BattleGardenScene.KEY);
    this.arena = arenaFor(island, stage);
    this.monsterSprite = monsterSprite;
    this.petSprite = petSprite;
    this.hour = hour;
    this.dark = dark;
    this.hooks = hooks;
  }

  private get size(): number {
    return SPRITE_SIZE * this.zoom;
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
    const size = this.size;

    for (let y = 0; y < ARENA_HEIGHT; y += 1) {
      for (let x = 0; x < ARENA_WIDTH; x += 1) {
        // Read through the same helper movement uses, so the ground drawn and
        // the ground walked can never be two different grids.
        const kind = tileKindAt(this.arena, x, y);
        if (!kind) continue;
        this.add.image(x * size, y * size, kind.sprite).setOrigin(0, 0);
      }
    }

    this.foeShadow = this.addShadow(this.arena.monster.x, this.arena.monster.y);
    this.petShadow = this.addShadow(this.arena.spawn.x, this.arena.spawn.y);

    this.foe = this.add
      .image(this.arena.monster.x * size, this.arena.monster.y * size, this.monsterSprite)
      .setOrigin(0, 0)
      .setDepth(9);

    this.tile = { ...this.arena.spawn };
    this.pet = this.add
      .image(this.tile.x * size, this.tile.y * size, this.petSprite)
      .setOrigin(0, 0)
      .setDepth(10);

    // A short, permanent idle bob on both sides. It is the cheapest thing that
    // stops a turn-based screen looking frozen between turns.
    this.idle(this.pet);
    this.idle(this.foe, 120);

    this.sparks = this.physics.add.group();

    this.applyLighting();

    this.input.keyboard?.on('keydown', this.onKey, this);
    this.input.on('pointerdown', this.onPointer, this);
  }

  private addShadow(tx: number, ty: number): Phaser.GameObjects.Ellipse {
    const size = this.size;
    return this.add
      .ellipse(tx * size + size / 2, ty * size + size - 2, size * 0.6, size * 0.2, 0x000000, 0.28)
      .setDepth(8);
  }

  private idle(target: Phaser.GameObjects.Image, delay = 0): void {
    this.tweens.add({
      targets: target,
      y: target.y - 2,
      duration: 900,
      delay,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  /**
   * Push `diorama.ts`'s numbers onto the scene.
   *
   * The shadow is skewed along `shadowDirection` and scaled by `shadowLength`,
   * so dawn throws both sprites' shadows long across the ground and noon pulls
   * them underfoot. The dark variant drops the whole scene's tint rather than
   * changing any sprite, which is what keeps it a mood and not a redraw.
   */
  private applyLighting(): void {
    const light = lightingAt(this.hour, 1);
    const tint = this.dark ? 0x7a7f96 : light.isNight ? 0xa8b0cc : 0xffffff;

    for (const target of [this.pet, this.foe]) target?.setTint(tint);

    for (const [shadow, at] of [
      [this.petShadow, this.tile],
      [this.foeShadow, this.arena.monster],
    ] as const) {
      if (!shadow) continue;
      const size = this.size;
      shadow.setScale(0.5 + light.shadowLength, 1);
      shadow.setAlpha(this.dark ? 0.16 : 0.1 + light.elevation * 0.22);
      shadow.x = at.x * size + size / 2 + Math.cos(light.shadowDirection) * light.shadowLength * 6;
      shadow.y = at.y * size + size - 2;
    }
  }

  relight(hour: number, dark: boolean): void {
    this.hour = hour;
    this.dark = dark;
    this.applyLighting();
  }

  /** Step one tile, if that tile exists and nothing solid is on it. */
  step(dx: number, dy: number): void {
    if (this.moving || this.engaged) return;
    const next = { x: this.tile.x + dx, y: this.tile.y + dy };

    // Each mascot is drawn once, facing right, and turned by flipping rather
    // than by four sprites apiece. Twenty more 16x16 grids to maintain would
    // buy a back view of a sponge, which nobody has ever wanted to see.
    if (dx !== 0) this.pet.setFlipX(dx < 0);

    // Walking *into* the monster is how a fight starts, so its tile is not
    // walkable even though the ground under it is.
    const ontoMonster = next.x === this.arena.monster.x && next.y === this.arena.monster.y;
    if (ontoMonster) {
      if (!this.beaten) this.engage();
      return;
    }
    if (!isWalkable(this.arena, next.x, next.y)) return;

    const size = this.size;
    this.moving = true;
    this.tweens.add({
      targets: this.pet,
      x: next.x * size,
      y: next.y * size,
      duration: STEP_MS,
      onComplete: () => {
        this.tile = next;
        this.moving = false;
        this.applyLighting();
        this.hooks.onMove?.();
        if (!this.beaten && isAdjacentToMonster(this.arena, next.x, next.y)) this.engage();
      },
    });
  }

  private engage(): void {
    if (this.engaged || this.beaten) return;
    this.engaged = true;
    this.hooks.onEngage();
  }

  /**
   * One exchange, as an animation.
   *
   * Resolves when it is done, so the page can pace the two halves of a round
   * apart instead of playing them on top of each other.
   */
  strike(blow: Blow, effectiveness: 'weak' | 'plain' | 'strong'): Promise<void> {
    const attacker = blow === 'player-hits' ? this.pet : this.foe;
    const victim = blow === 'player-hits' ? this.foe : this.pet;
    if (!attacker || !victim) return Promise.resolve();

    const towards = blow === 'player-hits' ? 1 : -1;
    const home = { x: attacker.x, y: attacker.y };
    const victimHome = victim.x;

    this.throwSpark(attacker, towards, effectiveness);

    return new Promise((resolve) => {
      this.tweens.add({
        targets: attacker,
        x: home.x + towards * this.zoom * 4,
        duration: STRIKE_MS / 2,
        yoyo: true,
        ease: 'Back.easeOut',
        onComplete: () => {
          attacker.x = home.x;
          this.tweens.add({
            targets: victim,
            x: victimHome + towards * KNOCKBACK * this.zoom,
            duration: HURT_MS / 2,
            yoyo: true,
            ease: 'Quad.easeOut',
            onComplete: () => {
              victim.x = victimHome;
              resolve();
            },
          });
          // The hurt flash. Red would fight every theme pack, so a struck
          // sprite goes bright and comes back rather than changing hue.
          victim.setTintFill(0xffffff);
          this.time.delayedCall(HURT_MS / 3, () => this.applyLighting());
        },
      });
    });
  }

  /**
   * A companion's skill, as one of five motions.
   *
   * `scene/vfx.ts` decides which motion a skill's `vfx` key maps to; this plays
   * it. Everything is drawn from primitives in the theme's accent, so a skill
   * needs no texture and a new one needs no art — which is the only reason ten
   * skills can each have their own flourish without ten files to maintain.
   */
  skill(vfx: string): Promise<void> {
    if (!this.pet) return Promise.resolve();
    const shape = shapeFor(vfx);
    const size = this.size;
    const at = { x: this.pet.x + size / 2, y: this.pet.y + size / 2 };
    const foeAt = this.foe
      ? { x: this.foe.x + size / 2, y: this.foe.y + size / 2 }
      : { x: at.x + size * 3, y: at.y };
    const accent = 0xffffff;

    return new Promise((resolve) => {
      const done = () => resolve();

      switch (shape) {
        case 'bolt': {
          // Something crossing the gap. The one shape that actually travels,
          // and the reason it reads as an attack rather than as an aura.
          const bolt = this.add
            .rectangle(at.x, at.y, this.zoom * 3, this.zoom, accent, 0.95)
            .setDepth(13);
          this.tweens.add({
            targets: bolt,
            x: foeAt.x,
            y: foeAt.y,
            duration: SKILL_MS * 0.6,
            ease: 'Quad.easeIn',
            onComplete: () => {
              bolt.destroy();
              this.flash(foeAt, accent, done);
            },
          });
          return;
        }

        case 'ring': {
          const ring = this.add
            .circle(at.x, at.y, size * 0.4)
            .setStrokeStyle(this.zoom, accent, 0.9)
            .setFillStyle(0, 0)
            .setDepth(11);
          this.tweens.add({
            targets: ring,
            scale: 2.4,
            alpha: 0,
            duration: SKILL_MS,
            ease: 'Quad.easeOut',
            onComplete: () => { ring.destroy(); done(); },
          });
          return;
        }

        case 'shield': {
          // Held in front of you, on the side the monster is on.
          const towards = foeAt.x >= at.x ? 1 : -1;
          const guard = this.add
            .arc(at.x + towards * size * 0.35, at.y, size * 0.55, -60, 60, false)
            .setStrokeStyle(this.zoom * 1.5, accent, 0.9)
            .setFillStyle(0, 0)
            .setDepth(11);
          guard.setScale(towards, 1);
          this.tweens.add({
            targets: guard,
            alpha: 0,
            scaleY: 1.25,
            duration: SKILL_MS,
            ease: 'Sine.easeOut',
            onComplete: () => { guard.destroy(); done(); },
          });
          return;
        }

        case 'motes': {
          // Something opening around you, and the only one that goes upward —
          // which is what makes rest and gratitude read differently from a hit.
          const motes = Array.from({ length: 7 }, (_, i) => {
            const dot = this.add
              .rectangle(
                at.x + (i - 3) * this.zoom * 2.2,
                at.y + this.zoom * 2,
                this.zoom, this.zoom, accent, 0.9,
              )
              .setDepth(12);
            this.tweens.add({
              targets: dot,
              y: dot.y - size * (0.8 + i * 0.08),
              alpha: 0,
              duration: SKILL_MS + i * 40,
              ease: 'Sine.easeOut',
              onComplete: () => dot.destroy(),
            });
            return dot;
          });
          this.time.delayedCall(SKILL_MS + 7 * 40, () => { void motes; done(); });
          return;
        }

        case 'burst':
        default: {
          this.flash(at, accent, done);
        }
      }
    });
  }

  /** A short bloom at a point, used as the landing of a bolt and as a burst. */
  private flash(at: { x: number; y: number }, colour: number, done: () => void): void {
    const bloom = this.add.circle(at.x, at.y, this.size * 0.25, colour, 0.8).setDepth(13);
    this.tweens.add({
      targets: bloom,
      scale: 2.2,
      alpha: 0,
      duration: SKILL_MS * 0.5,
      ease: 'Quad.easeOut',
      onComplete: () => { bloom.destroy(); done(); },
    });
  }

  /**
   * The one place Arcade Physics is used.
   *
   * A few short-lived bodies with gravity and an initial velocity, so the spark
   * arcs the way a thrown thing does. They collide with nothing — the group has
   * no collider registered against the pet, the monster or the ground — which
   * is what keeps this from becoming a second movement model.
   */
  private throwSpark(from: Phaser.GameObjects.Image, towards: number, effectiveness: string): void {
    const count = effectiveness === 'strong' ? 6 : effectiveness === 'weak' ? 2 : 4;
    const size = this.size;

    for (let i = 0; i < count; i += 1) {
      const spark = this.add.rectangle(
        from.x + size / 2, from.y + size / 2, this.zoom, this.zoom, 0xffffff, 0.9,
      ).setDepth(12);
      this.physics.add.existing(spark);
      this.sparks.add(spark);

      const body = spark.body as Phaser.Physics.Arcade.Body;
      body.setVelocity(towards * (90 + i * 28), -70 - i * 14);
      body.setGravityY(420);

      this.tweens.add({
        targets: spark,
        alpha: 0,
        duration: STRIKE_MS,
        onComplete: () => spark.destroy(),
      });
    }
  }

  /** The monster is down. Fade it out and leave the ground clear. */
  defeat(): Promise<void> {
    this.beaten = true;
    this.engaged = false;
    if (!this.foe) return Promise.resolve();

    return new Promise((resolve) => {
      this.tweens.add({
        targets: [this.foe, this.foeShadow],
        alpha: 0,
        scaleX: 1.4,
        scaleY: 1.4,
        duration: DEFEAT_MS,
        ease: 'Quad.easeIn',
        onComplete: () => resolve(),
      });
    });
  }

  /** The fight ended without a win. Put the pet back where it started. */
  withdraw(): void {
    this.engaged = false;
    if (!this.pet) return;
    const size = this.size;
    this.tile = { ...this.arena.spawn };
    this.tweens.add({
      targets: this.pet,
      x: this.tile.x * size,
      y: this.tile.y * size,
      duration: STEP_MS * 3,
      ease: 'Quad.easeInOut',
      onComplete: () => this.applyLighting(),
    });
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
    const size = this.size;
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
