import Phaser from 'phaser';
import { SPRITE_SIZE } from '../../../domain/rpg/sprites';
import {
  ARENA_HEIGHT, ARENA_WIDTH, allyTile, arenaFor, isAdjacentToMonster, isWalkable, tileKindAt,
  type Arena,
} from '../../../domain/rpg/arena';
import { lightingAt } from '../../../domain/rpg/diorama';
import { bakeAll } from '../../rpg/overworld/bake';
import { strikePlan, togetherBeats, type FightTiming } from '../../../domain/scene/strikePlan';
import { depthForRow, hopFor, liftAt } from '../../../domain/scene/walk';
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
  /**
   * The partner's last pick, standing on its own pedestal beside yours. Drawn
   * and lit, never moved and never struck: it is company, not a combatant, so
   * every fight stays exactly as winnable alone (`IslandTests`).
   */
  private allySprite: string | undefined;
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
  private ally?: Phaser.GameObjects.Image;
  private allyShadow?: Phaser.GameObjects.Ellipse;
  private allyAt?: { x: number; y: number };
  private sparks!: Phaser.Physics.Arcade.Group;
  /**
   * The pet's idle bob. Kept so a step can stop it: it tweens `y`, and so does
   * walking, and two tweens on one property is what made up/down steps drift
   * back towards the row the bob started on.
   */
  private petBob?: Phaser.Tweens.Tween;

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
    allySprite?: string,
  ) {
    super(BattleGardenScene.KEY);
    this.arena = arenaFor(island, stage);
    this.monsterSprite = monsterSprite;
    this.petSprite = petSprite;
    this.allySprite = allySprite;
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

    // Your pedestal at the spawn, and the partner's beside it. Yours stays put
    // when your pet walks off it to the fight.
    this.addPedestal(this.arena.spawn.x, this.arena.spawn.y);

    this.foeShadow = this.addShadow(this.arena.monster.x, this.arena.monster.y);
    this.petShadow = this.addShadow(this.arena.spawn.x, this.arena.spawn.y);

    this.foe = this.add
      .image(this.arena.monster.x * size, this.arena.monster.y * size, this.monsterSprite)
      .setOrigin(0, 0)
      .setDepth(depthForRow(this.arena.monster.y, ARENA_HEIGHT));

    this.tile = { ...this.arena.spawn };
    this.pet = this.add
      .image(this.tile.x * size, this.tile.y * size, this.petSprite)
      .setOrigin(0, 0)
      .setDepth(depthForRow(this.tile.y, ARENA_HEIGHT));

    this.setAlly(this.allySprite);

    // A short, permanent idle bob on both sides. It is the cheapest thing that
    // stops a turn-based screen looking frozen between turns.
    this.petBob = this.idle(this.pet);
    this.idle(this.foe, 120);

    this.sparks = this.physics.add.group();

    this.applyLighting();

    this.input.keyboard?.on('keydown', this.onKey, this);
    this.input.on('pointerdown', this.onPointer, this);
  }

  /**
   * Stand the partner's pet on its pedestal, swap it, or hide it.
   *
   * Live rather than read once: the partner's row can land after the scene
   * started, and a pick they make mid-visit should show without tearing down
   * the garden. Before `create` it only records the sprite, which `create`
   * then draws.
   */
  setAlly(sprite: string | undefined): void {
    this.allySprite = sprite;
    if (!this.pet) return;
    if (this.ally) {
      this.ally.setVisible(Boolean(sprite));
      this.allyShadow?.setVisible(Boolean(sprite));
      if (sprite) this.ally.setTexture(sprite);
      return;
    }
    if (!sprite) return;
    this.allyAt = allyTile(this.arena);
    if (!this.allyAt) return;
    const size = this.size;
    this.addPedestal(this.allyAt.x, this.allyAt.y);
    this.allyShadow = this.addShadow(this.allyAt.x, this.allyAt.y);
    this.ally = this.add
      .image(this.allyAt.x * size, this.allyAt.y * size, sprite)
      .setOrigin(0, 0)
      .setFlipX(this.allyAt.x > this.arena.monster.x)
      .setDepth(depthForRow(this.allyAt.y, ARENA_HEIGHT));
    this.idle(this.ally, 450);
    this.applyLighting();
  }

  /**
   * A low stone plinth with a rim of the pack's accent, the same ring of light
   * the Raid Gate draws under a chosen pet. Under the shadows (depth 7), so a
   * pet standing on it still casts onto it.
   */
  private addPedestal(tx: number, ty: number): void {
    const size = this.size;
    const cx = tx * size + size / 2;
    const top = ty * size + size - size * 0.12;
    this.add.rectangle(cx, top + size * 0.07, size * 0.74, size * 0.14, 0x000000, 0.22).setDepth(7);
    this.add.ellipse(cx, top, size * 0.78, size * 0.22, 0x000000, 0.18)
      .setStrokeStyle(Math.max(1, this.zoom - 1), this.accent, 0.7)
      .setDepth(7);
  }

  private addShadow(tx: number, ty: number): Phaser.GameObjects.Ellipse {
    const size = this.size;
    return this.add
      .ellipse(tx * size + size / 2, ty * size + size - 2, size * 0.6, size * 0.2, 0x000000, 0.28)
      .setDepth(8);
  }

  private idle(target: Phaser.GameObjects.Image, delay = 0): Phaser.Tweens.Tween {
    return this.tweens.add({
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

    for (const target of [this.pet, this.foe, this.ally]) target?.setTint(tint);

    for (const [shadow, at] of [
      [this.petShadow, this.tile],
      [this.foeShadow, this.arena.monster],
      [this.allyShadow, this.allyAt],
    ] as const) {
      if (!at) continue;
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

    this.moving = true;
    this.walkTo(next, STEP_MS, hopFor({ dy, calm: this.still }), () => {
      this.moving = false;
      this.hooks.onMove?.();
      if (!this.beaten && isAdjacentToMonster(this.arena, next.x, next.y)) this.engage();
    });
    return 'moved';
  }

  /**
   * Carry the pet, and its shadow, to a tile.
   *
   * One counter drives both, so the shadow stays underfoot for the whole step
   * instead of jumping when it lands, and the hop is added on top of the
   * straight line rather than being a second tween on `y`. The idle bob is
   * stopped first and restarted from the new row for the same reason.
   */
  private walkTo(to: { x: number; y: number }, duration: number, hop: number, done: () => void): void {
    const size = this.size;
    const from = { x: this.pet.x, y: this.pet.y };
    const shadowFrom = { x: this.petShadow.x, y: this.petShadow.y };
    const dx = to.x * size - from.x;
    const dy = to.y * size - from.y;
    this.petBob?.remove();
    this.petBob = undefined;
    // Draw order changes as the step starts, so walking up behind the monster
    // goes behind it rather than over it.
    this.pet.setDepth(depthForRow(to.y, ARENA_HEIGHT));

    const land = () => {
      this.pet.setPosition(to.x * size, to.y * size);
      this.tile = { ...to };
      this.applyLighting();
      this.petBob = this.idle(this.pet);
      done();
    };
    if (duration === 0) { land(); return; }

    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration,
      onUpdate: (tween) => {
        const t = tween.getValue() ?? 0;
        this.pet.setPosition(from.x + dx * t, from.y + dy * t - liftAt(t, hop * this.zoom));
        this.petShadow.setPosition(shadowFrom.x + dx * t, shadowFrom.y + dy * t);
      },
      onComplete: land,
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
   * The couple's move: your pet and your partner's spring at the foe together.
   *
   * About a second and a half (`FIGHT_TIMING.together`, split by
   * `togetherBeats`), in four beats:
   *
   * 1. **Gather** — both lean back, a thread of light links them and a ring
   *    opens round each, so it reads as two bodies agreeing to do one thing.
   * 2. **Charge** — both spring forward at once and a bolt leaves each, crossing
   *    to the foe.
   * 3. **Impact** — the two land together: one bloom, one ring, and the foe is
   *    knocked back and flashes, the way a plain hit does.
   * 4. **Settle** — both ease back, the thread fades.
   *
   * Only `x` is tweened on the sprites. Both idle bobs own `y` (a second tween
   * on the same property is what once made walking drift back to the old row),
   * and the lunges sit inside the 9–10 depth band while everything drawn on top
   * stays at 11 and above.
   *
   * The partner is the pet `setAlly` stood on its pedestal. With none, an echo
   * of your own pet — translucent, tinted in the accent — splits off, takes the
   * partner's part and folds back in, so the move is never one body short.
   * Under calm it resolves at once with nothing drawn.
   */
  together(effectiveness: 'weak' | 'plain' | 'strong'): Promise<void> {
    const lead = this.pet;
    const foe = this.foe;
    if (!lead || !foe || this.still) return Promise.resolve();

    const z = this.zoom;
    const size = this.size;
    const beats = togetherBeats(this.timing);
    const { fill, edge } = this.colours('accent');

    // Who stands beside you. A real partner's pet when one is on its pedestal;
    // otherwise an echo of yours, made here and removed before this resolves.
    const real = this.ally?.visible ? this.ally : undefined;
    const lean = (sprite: Phaser.GameObjects.Image) => (foe.x >= sprite.x ? 1 : -1);
    const away = lean(lead);
    const echo = real
      ? undefined
      : this.add.image(lead.x, lead.y, this.petSprite)
        .setOrigin(0, 0)
        .setFlipX(lead.flipX)
        .setAlpha(0)
        .setTint(this.accent)
        .setDepth(lead.depth);
    const mate = real ?? echo!;
    const mateHome = real
      ? { x: real.x, y: real.y }
      // Just behind you, so the two read as a pair rather than a stack.
      : { x: lead.x - away * size * 0.85, y: lead.y };
    const leadHome = { x: lead.x };
    const lunge = size * 0.3;

    // The thread between the two, redrawn as they move.
    const thread = this.add.line(0, 0, 0, 0, 0, 0, fill, 0).setOrigin(0, 0).setLineWidth(z).setDepth(11);
    const relink = () => {
      thread.setTo(
        lead.x + size / 2, lead.y + size * 0.55,
        mate.x + size / 2, mate.y + size * 0.55,
      );
    };
    relink();

    // The pace a shape's own timer should run at to fill a beat.
    const paced = (ms: number) => ms / Math.max(1, this.timing.skill);
    const centre = (sprite: Phaser.GameObjects.Image): Point => ({ x: sprite.x + size / 2, y: sprite.y + size / 2 });

    return new Promise((resolve) => {
      const finish = () => {
        thread.destroy();
        echo?.destroy();
        lead.x = leadHome.x;
        if (real) real.x = mateHome.x;
        resolve();
      };

      // 1. Gather: lean back together, link up, a ring round each.
      if (echo) {
        this.tweens.add({ targets: echo, x: mateHome.x, y: mateHome.y, alpha: 0.6, duration: beats.gather, ease: 'Sine.easeOut' });
      }
      this.tweens.add({ targets: thread, alpha: 0.9, duration: beats.gather, ease: 'Sine.easeOut' });
      this.tweens.add({
        targets: lead,
        x: leadHome.x - away * z * 3,
        duration: beats.gather,
        ease: 'Sine.easeOut',
        onUpdate: relink,
      });
      this.tweens.add({
        targets: mate,
        x: mateHome.x - lean(mate) * z * 3,
        duration: beats.gather,
        ease: 'Sine.easeOut',
        onUpdate: relink,
      });
      void this.playShape('ring', centre(lead), centre(lead), { fill, edge, count: 1, pace: paced(beats.gather) });
      void this.playShape('ring', centre(mate), centre(mate), { fill, edge, count: 1, pace: paced(beats.gather) });

      this.time.delayedCall(beats.gather, () => {
        // 2. Charge: both spring at once, a bolt from each.
        const strong = effectiveness === 'strong' ? 2 : 0;
        const boltPace = paced(beats.charge / 0.6);
        void this.playShape('bolt', centre(lead), centre(foe), { fill, edge, count: 1 + strong, pace: boltPace });
        void this.playShape('bolt', centre(mate), centre(foe), { fill, edge, count: 1 + strong, pace: boltPace });
        this.tweens.add({
          targets: lead, x: lead.x + away * (lunge + z * 3), duration: beats.charge, ease: 'Quad.easeIn', onUpdate: relink,
        });
        this.tweens.add({
          targets: mate, x: mate.x + lean(mate) * (lunge + z * 3), duration: beats.charge, ease: 'Quad.easeIn', onUpdate: relink,
        });

        this.time.delayedCall(beats.charge, () => {
          // 3. Impact: the two land together; the foe takes it like any hit.
          const foeHome = foe.x;
          void this.playShape('ring', centre(foe), centre(foe), { fill, edge, count: 1, pace: paced(beats.impact) });
          foe.setTintFill(0xffffff);
          this.time.delayedCall(this.timing.hurt / 3, () => this.applyLighting());
          this.tweens.add({
            targets: foe,
            x: foeHome + away * KNOCKBACK * z * 1.5,
            duration: beats.impact / 2,
            yoyo: true,
            ease: 'Quad.easeOut',
            onComplete: () => { foe.x = foeHome; },
          });

          this.time.delayedCall(beats.impact, () => {
            // 4. Settle: back to where each began, and the thread lets go.
            this.tweens.add({ targets: thread, alpha: 0, duration: beats.settle });
            if (echo) {
              this.tweens.add({ targets: echo, x: lead.x, y: lead.y, alpha: 0, duration: beats.settle });
            }
            this.tweens.add({ targets: lead, x: leadHome.x, duration: beats.settle, ease: 'Sine.easeInOut', onUpdate: relink });
            if (real) {
              this.tweens.add({ targets: real, x: mateHome.x, duration: beats.settle, ease: 'Sine.easeInOut', onUpdate: relink });
            }
            this.time.delayedCall(beats.settle, finish);
          });
        });
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
    this.moving = true;
    this.walkTo({ ...this.arena.spawn }, this.still ? 0 : STEP_MS * 3, 0, () => { this.moving = false; });
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
