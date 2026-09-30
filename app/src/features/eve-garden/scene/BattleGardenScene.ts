import Phaser from 'phaser';
import { SPRITE_SIZE } from '../../../domain/rpg/sprites';
import {
  ARENA_HEIGHT, ARENA_WIDTH, arenaFor, isAdjacentToMonster, isWalkable, tileKindAt,
  type Arena,
} from '../../../domain/rpg/arena';
import { lightingAt } from '../../../domain/rpg/diorama';
import { bakeAll } from '../../rpg/overworld/bake';
import { strikePlan, type FightTiming } from '../../../domain/scene/strikePlan';
import {
  effectColours, moveVfxFor, shapeFor, type EffectPalette, type EffectToken, type VfxShape,
} from './vfx';
import { signatureFor, type SignaturePiece } from './signatures';
import type { Blow, Cast, SceneHooks, StepResult } from './events';

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

type Point = { x: number; y: number };

/** How one effect is drawn: resolved colours, and how many and how fast. */
interface Look {
  fill: number;
  edge?: number;
  count: number;
  pace: number;
}

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
  /** Every fight beat's length; all zero under calm (`domain/scene/strikePlan.ts`). */
  private timing: FightTiming;
  /**
   * The pack's accent, read once in `preload` beside the sprite palette. White
   * was the stand-in, and it made every companion's move look like nobody's.
   */
  private accent = 0xffffff;
  /**
   * The pack's colours as hex, for the per-move effects. Read beside the
   * accent; `effectColours` decides which ones need an edge to be seen. Empty
   * until then, and an empty one draws in the accent.
   */
  private palette: EffectPalette = { accent: '', success: '', danger: '', text: '', base: '' };

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
    calm: boolean,
    hooks: SceneHooks,
  ) {
    super(BattleGardenScene.KEY);
    this.arena = arenaFor(island, stage);
    this.monsterSprite = monsterSprite;
    this.petSprite = petSprite;
    this.hour = hour;
    this.dark = dark;
    this.timing = strikePlan({ calm });
    this.hooks = hooks;
  }

  /** Calm changed mid-fight. Takes effect from the next beat; nothing restarts. */
  setCalm(calm: boolean): void {
    this.timing = strikePlan({ calm });
  }

  private get still(): boolean {
    return this.timing.strike === 0;
  }

  /** A token as Phaser numbers: the fill, and the edge it needs if any. */
  private colours(token: EffectToken): { fill: number; edge?: number } {
    const { fill, edge } = effectColours(token, this.palette);
    const toInt = (css: string) => (css ? Phaser.Display.Color.ValueToColor(css).color : this.accent);
    return { fill: toInt(fill), edge: edge === undefined ? undefined : toInt(edge) };
  }

  private get size(): number {
    return SPRITE_SIZE * this.zoom;
  }

  preload(): void {
    // Nothing is fetched. Every texture is drawn from the character grids in
    // `domain/rpg/sprites.ts`, in the palette the app is currently wearing.
    const host = this.game.canvas.parentElement ?? document.body;
    const baked = bakeAll(host, this.zoom);
    const accent = getComputedStyle(host).getPropertyValue('--color-accent').trim();
    if (accent) this.accent = Phaser.Display.Color.ValueToColor(accent).color;
    const style = getComputedStyle(host);
    for (const token of Object.keys(this.palette) as (keyof EffectPalette)[]) {
      const value = style.getPropertyValue(`--color-${token}`).trim();
      if (value) this.palette[token] = value;
    }
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

  /**
   * Step one tile, if that tile exists and nothing solid is on it.
   *
   * Says what happened, for the on-screen pad's haptics. The keyboard and the
   * canvas tap ignore the answer, so they behave exactly as they did.
   */
  step(dx: number, dy: number): StepResult {
    if (this.moving || this.engaged) return 'busy';
    const next = { x: this.tile.x + dx, y: this.tile.y + dy };

    // Each mascot is drawn once, facing right, and turned by flipping rather
    // than by four sprites apiece. Twenty more 16x16 grids to maintain would
    // buy a back view of a sponge, which nobody has ever wanted to see.
    if (dx !== 0) this.pet.setFlipX(dx < 0);

    // Walking *into* the monster is how a fight starts, so its tile is not
    // walkable even though the ground under it is.
    const ontoMonster = next.x === this.arena.monster.x && next.y === this.arena.monster.y;
    if (ontoMonster) {
      if (this.beaten) return 'blocked';
      this.engage();
      return 'engaged';
    }
    if (!isWalkable(this.arena, next.x, next.y)) return 'blocked';

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
    return 'moved';
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
  strike(blow: Blow, effectiveness: 'weak' | 'plain' | 'strong', cast?: Cast): Promise<void> {
    const attacker = blow === 'player-hits' ? this.pet : this.foe;
    const victim = blow === 'player-hits' ? this.foe : this.pet;
    if (!attacker || !victim) return Promise.resolve();
    // Calm: no lunge, no knockback, no flash. The log and the bars already say
    // what happened, and nothing waits on this.
    if (this.still) return Promise.resolve();

    const towards = blow === 'player-hits' ? 1 : -1;
    const home = { x: attacker.x, y: attacker.y };
    const victimHome = victim.x;

    // A companion's own move is drawn its own way; the monster's swings and
    // Together keep the plain spark. A hit on the weakness throws two more.
    const look = cast && blow === 'player-hits' ? moveVfxFor(cast.kit, cast.move) : undefined;
    if (look) {
      const { from, to } = this.ends(attacker, victim);
      const extra = effectiveness === 'strong' ? 2 : 0;
      void this.playShape(look.shape, from, to, { ...this.colours(look.token), count: look.count + extra, pace: look.pace });
    } else {
      this.throwSpark(attacker, towards, effectiveness);
    }

    return new Promise((resolve) => {
      this.tweens.add({
        targets: attacker,
        x: home.x + towards * this.zoom * 4,
        duration: this.timing.strike / 2,
        yoyo: true,
        ease: 'Back.easeOut',
        onComplete: () => {
          attacker.x = home.x;
          this.tweens.add({
            targets: victim,
            x: victimHome + towards * KNOCKBACK * this.zoom,
            duration: this.timing.hurt / 2,
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
          this.time.delayedCall(this.timing.hurt / 3, () => this.applyLighting());
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
    if (!this.pet || this.still) return Promise.resolve();
    const { from, to } = this.ends(this.pet, this.foe);
    const shape = shapeFor(vfx);
    const piece = signatureFor(vfx);
    // A skill's burst is the companion's own bloom, so it lands on the pet.
    const motion = this.playShape(shape, from, shape === 'burst' ? from : to, { fill: this.accent, count: 1, pace: 1 });
    if (!piece) return motion;
    return motion.then(() => this.drawSignature(piece, piece.at === 'foe' ? to : from));
  }

  /**
   * A companion's own piece (`scene/signatures.ts`), drawn from primitives in
   * the accent — with its edge where the accent cannot stand on the ground.
   * Every piece does the same thing over time: swells a little and fades, so
   * the drawing is the difference and the motion stays quiet.
   */
  private drawSignature(piece: SignaturePiece, at: Point): Promise<void> {
    if (this.still) return Promise.resolve();
    const { fill, edge } = this.colours('accent');
    const z = this.zoom;
    const r = this.size * 0.45;
    const outline = <T extends Phaser.GameObjects.Shape>(part: T): T =>
      (edge === undefined ? part : part.setStrokeStyle(z * 0.5, edge, 1));
    const ring = (part: Phaser.GameObjects.Shape, width: number) =>
      part.setStrokeStyle(width, edge ?? fill, 1).setFillStyle(fill, edge === undefined ? 0 : 0.35);

    const parts: Phaser.GameObjects.Shape[] = [];
    switch (piece.kind) {
      case 'star':
        parts.push(outline(this.add.star(at.x, at.y, piece.points, r * 0.45, r, fill, 0.95)));
        break;
      case 'spiral':
        for (let i = 0; i < piece.arcs; i += 1) {
          const start = i * (360 / piece.arcs);
          parts.push(ring(this.add.arc(at.x, at.y, r * (0.6 + i * 0.3), start, start + 200, false), z));
        }
        break;
      case 'cells': {
        const corners = Array.from({ length: piece.sides }, (_, i) => {
          const a = (Math.PI * 2 * i) / piece.sides;
          return [Math.cos(a) * r, Math.sin(a) * r];
        }).flat();
        parts.push(ring(this.add.polygon(at.x, at.y, corners), z * 1.5));
        parts.push(ring(this.add.polygon(at.x, at.y, corners.map((c) => c * 0.45)), z));
        break;
      }
      case 'crescent':
        parts.push(ring(this.add.arc(at.x, at.y, r, 40, 320, false), z * 2));
        for (let i = 0; i < piece.stars; i += 1) {
          parts.push(outline(this.add.star(at.x + r * (1.1 + i * 0.35), at.y - r * (0.9 - i * 0.5), 4, z * 0.6, z * 1.6, fill)));
        }
        break;
      case 'fan':
        for (let i = 0; i < piece.flames; i += 1) {
          const flame = outline(this.add.triangle(at.x, at.y - r * 0.4, 0, z * 5, z * 1.5, 0, z * 3, z * 5, fill, 0.9));
          flame.setOrigin(0.5, 1).setAngle(-60 + (120 * i) / Math.max(1, piece.flames - 1));
          parts.push(flame);
        }
        break;
    }
    for (const part of parts) part.setDepth(14);

    return new Promise((resolve) => {
      this.tweens.add({
        targets: parts,
        scale: 1.3,
        alpha: 0,
        duration: this.timing.skill,
        ease: 'Sine.easeOut',
        onComplete: () => { for (const part of parts) part.destroy(); resolve(); },
      });
    });
  }

  /** The middles of two sprites; a missing target stands three tiles ahead. */
  private ends(
    self: Phaser.GameObjects.Image,
    other: Phaser.GameObjects.Image | undefined,
  ): { from: Point; to: Point } {
    const half = this.size / 2;
    const from = { x: self.x + half, y: self.y + half };
    const to = other ? { x: other.x + half, y: other.y + half } : { x: from.x + this.size * 3, y: from.y };
    return { from, to };
  }

  /**
   * One of the five motions, from `from` towards `to`.
   *
   * `bolt` crosses the gap and `burst` blooms where it lands; `ring`, `shield`
   * and `motes` happen around `from`, because they are things you do rather
   * than things you throw. `count` repeats the shape, staggered, which is most
   * of what makes one companion's bolt a hoofbeat and another's a gust.
   *
   * Shapes that are only a stroke get their edge as a wider stroke laid
   * underneath, since a Phaser shape has one stroke to give.
   */
  private playShape(shape: VfxShape, from: Point, to: Point, look: Look): Promise<void> {
    const { fill, edge, pace } = look;
    const count = Math.max(1, look.count);
    const beat = this.timing.skill * pace;
    const stagger = beat * 0.15;
    const z = this.zoom;
    const size = this.size;
    const edged = <T extends Phaser.GameObjects.Shape>(piece: T): T =>
      (edge === undefined ? piece : piece.setStrokeStyle(z * 0.5, edge, 1));
    const stroked = (make: (colour: number, width: number) => Phaser.GameObjects.Shape, width: number) =>
      [
        ...(edge === undefined ? [] : [make(edge, width + z)]),
        make(fill, width),
      ];

    return new Promise((resolve) => {
      let left = count;
      const one = () => { left -= 1; if (left === 0) resolve(); };

      for (let i = 0; i < count; i += 1) {
        const offset = (i - (count - 1) / 2) * z * 2;
        const delay = i * stagger;

        switch (shape) {
          case 'bolt': {
            // Something crossing the gap. The one shape that actually travels,
            // and the reason it reads as an attack rather than as an aura.
            const bolt = edged(this.add.rectangle(from.x, from.y + offset, z * 3, z, fill, 0.95)).setDepth(13);
            this.tweens.add({
              targets: bolt,
              x: to.x,
              y: to.y + offset,
              delay,
              duration: beat * 0.6,
              ease: 'Quad.easeIn',
              onComplete: () => {
                bolt.destroy();
                this.flash(to, fill, edge, beat, one);
              },
            });
            break;
          }

          case 'ring': {
            const rings = stroked(
              (colour, width) => this.add.circle(from.x, from.y, size * 0.4)
                .setStrokeStyle(width, colour, 0.9).setFillStyle(0, 0).setDepth(11),
              z,
            );
            this.tweens.add({
              targets: rings,
              scale: 2.4 + i * 0.5,
              alpha: 0,
              delay,
              duration: beat,
              ease: 'Quad.easeOut',
              onComplete: () => { for (const r of rings) r.destroy(); one(); },
            });
            break;
          }

          case 'shield': {
            // Held in front of you, on the side the monster is on; a second
            // and third are held a little further out.
            const towards = to.x >= from.x ? 1 : -1;
            const guards = stroked(
              (colour, width) => this.add
                .arc(from.x + towards * size * 0.35, from.y, size * (0.55 + i * 0.12), -60, 60, false)
                .setStrokeStyle(width, colour, 0.9).setFillStyle(0, 0).setDepth(11)
                .setScale(towards, 1),
              z * 1.5,
            );
            this.tweens.add({
              targets: guards,
              alpha: 0,
              scaleY: 1.25,
              delay,
              duration: beat,
              ease: 'Sine.easeOut',
              onComplete: () => { for (const g of guards) g.destroy(); one(); },
            });
            break;
          }

          case 'motes': {
            // Something opening around you, and the only one that goes upward —
            // which is what makes rest and gratitude read differently from a hit.
            const dot = edged(this.add.rectangle(from.x + offset * 1.1, from.y + z * 2, z, z, fill, 0.9)).setDepth(12);
            this.tweens.add({
              targets: dot,
              y: dot.y - size * (0.8 + i * 0.08),
              alpha: 0,
              delay: i * 40 * pace,
              duration: beat,
              ease: 'Sine.easeOut',
              onComplete: () => { dot.destroy(); one(); },
            });
            break;
          }

          case 'burst':
          default: {
            // Several blooms scatter a little around the landing point.
            const at = { x: to.x + (i === 0 ? 0 : offset), y: to.y - (i === 0 ? 0 : Math.abs(offset)) };
            this.time.delayedCall(delay, () => this.flash(at, fill, edge, beat, one));
          }
        }
      }
    });
  }

  /** A short bloom at a point, used as the landing of a bolt and as a burst. */
  private flash(at: Point, colour: number, edge: number | undefined, beat: number, done: () => void): void {
    const bloom = this.add.circle(at.x, at.y, this.size * 0.25, colour, 0.8).setDepth(13);
    if (edge !== undefined) bloom.setStrokeStyle(this.zoom * 0.5, edge, 1);
    this.tweens.add({
      targets: bloom,
      scale: 2.2,
      alpha: 0,
      duration: beat * 0.5,
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
        from.x + size / 2, from.y + size / 2, this.zoom, this.zoom, this.accent, 0.9,
      ).setDepth(12);
      this.physics.add.existing(spark);
      this.sparks.add(spark);

      const body = spark.body as Phaser.Physics.Arcade.Body;
      body.setVelocity(towards * (90 + i * 28), -70 - i * 14);
      body.setGravityY(420);

      this.tweens.add({
        targets: spark,
        alpha: 0,
        duration: this.timing.strike,
        onComplete: () => spark.destroy(),
      });
    }
  }

  /** The monster is down. Fade it out and leave the ground clear. */
  defeat(): Promise<void> {
    this.beaten = true;
    this.engaged = false;
    if (!this.foe) return Promise.resolve();
    if (this.still) {
      for (const target of [this.foe, this.foeShadow]) target?.setAlpha(0);
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.tweens.add({
        targets: [this.foe, this.foeShadow],
        alpha: 0,
        scaleX: 1.4,
        scaleY: 1.4,
        duration: this.timing.defeat,
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
    if (this.still) {
      this.pet.setPosition(this.tile.x * size, this.tile.y * size);
      this.applyLighting();
      return;
    }
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
