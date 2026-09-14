import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, loadSettings } from '../../db/database';
import {
  awardPetXp, chooseRaidCompanion, clearStageFor, coupleVitals, ensureIdentity, gardenMomentum,
  loadWorldProgress, openRaidGate, recordRaidRounds, travelToIsland,
} from '../../db/repository';
import { todayKey } from '../../domain/day';
import { levelForXp } from '../../domain/xp';
import { spriteKeyForTheme } from '../../domain/rpg/sprites';
import { RADIANCE_FULL } from '../../domain/rpg/vitals';
import { fireSkill, kitFor, turnFor } from '../../domain/rpg/companionSkills';
import type { GateCard, GateVerdict } from '../../domain/rpg/raidGate';
import { variantFor } from '../../domain/rpg/diorama';
import {
  ISLAND_COUNT, currentStage, isIslandComplete, islandProgress,
  newWorldProgress, type WorldProgress,
} from '../../domain/rpg/world';
import { createGameClient, isClosed, type GameClient } from './engine/client';
import type {
  ActionDto, BattleDto, DioramaTheme, IslandDto, MonsterDto, ProgressDto,
} from './engine/types';
import type { SceneHandle } from './scene/events';
import { logActivity } from './logging';
import { GardenBackdrop } from './GardenBackdrop';
import { RaidGate } from './gate/RaidGate';
import { Compass } from './Compass';
import { WorldMap } from './WorldMap';
import { WellnessCards } from './WellnessCards';
import { BattleLog } from './BattleLog';
import { ActionBar } from './ActionBar';
import { VictoryBanner } from './VictoryBanner';

/**
 * Eve's Garden.
 *
 * The only screen in the app that mounts a game engine *and* a WebAssembly
 * runtime, and the only place combat happens. It is also the couple's
 * dashboard: the cards, the action bar and the log are the same controls the
 * mood and exercise pages own, over a canvas instead of under a heading.
 *
 * ## Who owns what
 *
 * Three pieces, and the boundaries between them are the whole design:
 *
 * - **C#, in a worker**, owns the rules. Monster stats, the type chart, damage,
 *   turn order, the level curve. It is stateless: this page hands the battle
 *   back on every call.
 * - **Phaser** owns the picture. It is told to play a strike; it does not know
 *   what a strike is worth. Nothing in `scene/` imports from `engine/`.
 * - **This page** owns everything that outlives a fight — which is only ever a
 *   repository write. Nothing here invents a number.
 *
 * ## The gate comes first
 *
 * Nothing on this page mounts until a companion has been chosen. The Raid Gate
 * is rendered *instead of* the garden rather than over it, which is what makes
 * "no Phaser and no WebAssembly until somebody has actually decided to go in"
 * true rather than aspirational — both effects below are inside the branch that
 * only runs once `companion` is set.
 *
 * The gate re-opens on every mount, and a route change unmounts this page, so
 * leaving for another tab and coming back re-opens it exactly as the design
 * asks. It opens with last time's companion already ringed, so that is one tap
 * rather than a toll booth.
 *
 * ## Two teardowns, both of which cost a phone real resources
 *
 * The Phaser handle and the worker are both created in effects and both must be
 * released. `live` guards the async race where a dynamic import resolves after
 * unmount — without it, React 18 StrictMode's double-mount leaves two canvases
 * and two rAF loops running over each other — and the worker is terminated
 * rather than left holding 3.5 MB of runtime for a route nobody is on.
 */

const FALLBACK_ZONE = 'America/Los_Angeles';

/** How long the page waits between the two halves of a round. */
const TURN_GAP_MS = 220;

/**
 * An XP total comfortably past the last level, for asking what the top of the
 * curve unlocks. `Progression.XpForLevel(10)` is 3162; this only has to be more
 * than that and to fit in an `int`.
 */
const TOP_OF_THE_CURVE = 1_000_000;

type Busy = 'idle' | 'acting' | 'logging';

export function EveGardenPage() {
  const host = useRef<HTMLDivElement | null>(null);
  const scene = useRef<SceneHandle | null>(null);
  const client = useRef<GameClient | null>(null);

  const settings = useLiveQuery(loadSettings, []);
  const zone = settings?.timeZone ?? FALLBACK_ZONE;
  const day = todayKey(zone);

  const [identity, setIdentity] = useState<{ memberId: string; coupleId: string } | null>(null);
  useEffect(() => {
    let live = true;
    ensureIdentity().then((next) => { if (live) setIdentity(next); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const memberId = settings?.memberId ?? identity?.memberId;
  const coupleId = settings?.coupleId ?? identity?.coupleId;

  // Each of these reads one part of the record and re-fires only when that part
  // changes. None of them calls `loadSettings` — doing that inside a live query
  // triggers a sync rewrite that re-fires it up to twenty times a foreground
  // cycle — so the day key is computed above and passed in.
  const vitals = useLiveQuery(() => coupleVitals(day), [day]);
  const momentum = useLiveQuery(() => gardenMomentum(day), [day]);
  const pet = useLiveQuery(() => (coupleId ? db.pet.get(coupleId) : undefined), [coupleId]);
  const stored = useLiveQuery(
    () => (coupleId ? loadWorldProgress(coupleId) : undefined),
    [coupleId],
  );

  const world: WorldProgress = stored ?? newWorldProgress(coupleId ?? 'unpaired', Date.now());
  const theme: DioramaTheme = momentum ? variantFor(momentum) : 'Light';
  const dark = theme === 'Dark';

  const island = world.island;
  const stage = currentStage(world);

  const [islands, setIslands] = useState<IslandDto[]>([]);
  const [progress, setProgress] = useState<ProgressDto | null>(null);
  const [allActions, setAllActions] = useState<ActionDto[]>([]);
  const [monster, setMonster] = useState<MonsterDto | null>(null);
  const [battle, setBattle] = useState<BattleDto | null>(null);
  const [busy, setBusy] = useState<Busy>('idle');
  const [mapOpen, setMapOpen] = useState(false);
  const [victory, setVictory] = useState<
    { monster: MonsterDto; xp: number; leveledUp: boolean; level: number; rewardText: string } | null
  >(null);
  const [note, setNote] = useState<string | null>(null);

  /* ---- the gate ---- */

  const [gate, setGate] = useState<{ cards: GateCard[]; verdict: GateVerdict } | null>(null);
  const [companion, setCompanion] = useState<string | null>(null);
  /** Rounds fought this visit, credited to the companion when a fight ends. */
  const rounds = useRef(0);
  /** Turns since each kit's skill last fired. Refs, not state: a cooldown that
   *  re-rendered the page every turn would redraw the action bar mid-animation. */
  const cooldowns = useRef<Record<string, number>>({});
  /** Once-a-raid skills already spent. Cleared when a new raid is entered. */
  const spent = useRef<Set<string>>(new Set());
  const [flourish, setFlourish] = useState<string | null>(null);

  const openGate = useCallback((askedToChange = false) => {
    let live = true;
    openRaidGate({ askedToChange })
      .then((next) => { if (live) { setGate(next); setCompanion(null); } })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  useEffect(() => openGate(false), [openGate]);

  const onEnter = useCallback((themeId: string) => {
    setCompanion(themeId);
    rounds.current = 0;
    cooldowns.current = {};
    spent.current = new Set();
    setFlourish(null);
    void chooseRaidCompanion(themeId);
  }, []);

  const petXp = pet?.xp ?? 0;
  const petLevel = levelForXp(petXp);
  const kit = useMemo(() => kitFor(companion ?? undefined), [companion]);
  const petSprite = spriteKeyForTheme(companion ?? undefined);

  /**
   * How full the tether is.
   *
   * Read off the couple's momentum rather than stored, for the reason nothing
   * derived is stored anywhere in this app: a saved combo meter is a second
   * copy of the logs that can disagree with them, and the copy is always the
   * one on screen.
   */
  const resonance = Math.min(1, Math.max(0, 1 - (momentum?.daysSinceLog ?? 0) / 7));

  /* ---- the worker ---- */

  useEffect(() => {
    // Nothing is fetched and no runtime is started while the gate is up. 3.5 MB
    // of WebAssembly for a screen somebody might back out of is exactly the
    // cost the gate is well placed to avoid.
    if (!companion) return undefined;

    const game = createGameClient();
    client.current = game;
    let live = true;

    game.ready()
      .then(() => game.world())
      .then((dto) => { if (live) setIslands(dto.islands); })
      // Everything the top of the curve unlocks, for the locked rows in the
      // bar. Asked for by a number past the last level rather than by
      // MAX_SAFE_INTEGER, which does not fit in the C# `int` on the other side
      // of the boundary — that failed at the marshaller and read, from here,
      // as the whole runtime failing to boot.
      .then(() => game.progress(TOP_OF_THE_CURVE))
      .then((top) => { if (live) setAllActions(top.actions); })
      .catch((error) => {
        if (live && !isClosed(error)) {
          setNote('The garden could not wake up. It needs one online visit before it works offline.');
        }
      });

    return () => {
      live = false;
      game.close();
      client.current = null;
    };
  }, [companion]);

  /* ---- level and unlocked actions, recomputed when the pet's XP moves ---- */

  useEffect(() => {
    const game = client.current;
    if (!game) return undefined;
    let live = true;
    game.progress(petXp)
      .then((next) => { if (live) setProgress(next); })
      .catch(() => {});
    return () => { live = false; };
  }, [petXp]);

  /* ---- which monster is standing on this stage ---- */

  useEffect(() => {
    const game = client.current;
    if (!game) return undefined;
    let live = true;
    game.stage(island, stage, theme)
      .then((dto) => { if (live) setMonster(dto?.monster ?? null); })
      .catch(() => {});
    return () => { live = false; };
  }, [island, stage, theme]);

  /* ---- the canvas ---- */

  const onEngage = useCallback(() => {
    const game = client.current;
    if (!game || !progress || !monster) return;
    game.beginBattle(island, stage, theme, progress.level, Date.now())
      .then((next) => setBattle(next))
      .catch(() => {});
  }, [island, stage, theme, progress, monster]);

  // The scene is rebuilt when the stage or the island's face changes, and at no
  // other time. `onEngage` is deliberately absent from the dependencies: it
  // closes over state that settles, and rebuilding the whole canvas when it
  // changes would tear the garden down mid-walk. The scene reads it through a
  // ref that the effect below keeps current.
  const engageRef = useRef(onEngage);
  engageRef.current = onEngage;

  const sprite = monster?.spriteKey;

  useEffect(() => {
    if (!sprite || !companion || !host.current) return undefined;
    let live = true;

    import('./scene/game')
      .then(({ startGarden }) => {
        if (!live || !host.current) return;
        scene.current = startGarden(
          host.current,
          {
            island,
            stage,
            monsterSprite: sprite,
            petSprite,
            hour: new Date().getHours(),
            dark,
          },
          { onEngage: () => engageRef.current() },
        );
      })
      .catch(() => { if (live) setNote('The garden would not open. Try again in a moment.'); });

    return () => {
      live = false;
      scene.current?.destroy();
      scene.current = null;
    };
  }, [island, stage, sprite, petSprite, companion, dark]);

  /* ---- a round ---- */

  /** How a hit should look, from the same chart C# used to price it. */
  function edgeOf(element: ActionDto['element'], foe: MonsterDto | null) {
    if (!foe) return 'plain' as const;
    if (element === foe.weakness) return 'strong' as const;
    if (element === foe.strength) return 'weak' as const;
    return 'plain' as const;
  }

  const finish = useCallback(async (ended: BattleDto, foe: MonsterDto) => {
    setBattle(ended);

    // Credited whichever way the fight went, and deliberately: affinity counts
    // rounds *stood*, not rounds won. A fight you fled is still one you took
    // that companion into, and nothing in this app takes something away for a
    // week that went badly.
    if (companion && rounds.current > 0) {
      void recordRaidRounds(companion, rounds.current);
      rounds.current = 0;
    }

    if (ended.outcome !== 'Won') {
      scene.current?.withdraw();
      return;
    }

    await scene.current?.defeat();
    if (!coupleId) return;

    // The award id is the monster, not the phone: both partners see the same
    // victory and both will report it, and `awardPetXp` dedups on the id — so
    // a stage pays once however many devices watched it fall.
    await awardPetXp(coupleId, `garden-stage-${ended.monsterId}`, ended.xpOwed);
    const after = await clearStageFor(coupleId, ended.monsterId);

    const game = client.current;
    const next = game ? await game.progress(petXp + ended.xpOwed) : null;
    if (next) setProgress(next);

    setVictory({
      monster: foe,
      xp: ended.xpOwed,
      leveledUp: Boolean(next && progress && next.level > progress.level),
      level: next?.level ?? progress?.level ?? 1,
      rewardText: next && progress && next.level > progress.level
        ? `Level ${next.level}.`
        : '',
    });
    void after;
  }, [coupleId, petXp, progress, companion]);

  const playRound = useCallback(async (opening: BattleDto, actionId: string) => {
    const game = client.current;
    const foe = monster;
    if (!game || !foe) return;

    setBusy('acting');
    try {
      const mine = await game.act(opening, actionId);
      if (!mine) return;
      setBattle(mine);

      // Flee and a refused action both come back with the turn still ours; only
      // animate a swing that actually happened.
      const swung = mine.turn === 'Monster' && actionId !== 'flee';
      if (swung) {
        const action = progress?.actions.find((a) => a.id === actionId);
        rounds.current += 1;

        // The companion's own move, before the swing it decorates. C# has
        // already priced the turn — this is the picture, and `fireSkill` is
        // asked only whether it is the companion's to play.
        if (action?.activity) {
          const verdict = fireSkill(kit, turnFor(action.activity), {
            hour: new Date().getHours(),
            sinceLastUse: cooldowns.current[kit.themeId] ?? Infinity,
            spentThisRaid: spent.current.has(kit.signature.id),
            healthFraction: mine.player.hpFraction,
            weakness: foe.weakness,
          });
          if (verdict.fires) {
            cooldowns.current[kit.themeId] = 0;
            if (verdict.skill.oncePerRaid) spent.current.add(verdict.skill.id);
            setFlourish(verdict.skill.name);
            await scene.current?.skill(verdict.skill.vfx);
          }
        }
        for (const key of Object.keys(cooldowns.current)) cooldowns.current[key] += 1;

        await scene.current?.strike('player-hits', edgeOf(action?.element ?? 'Movement', foe));
      }

      if (mine.outcome !== 'Fighting') {
        await finish(mine, foe);
        return;
      }
      if (mine.turn !== 'Monster') return;

      await new Promise((resolve) => setTimeout(resolve, TURN_GAP_MS));

      const theirs = await game.monsterMove(mine);
      if (!theirs) return;
      setBattle(theirs);
      await scene.current?.strike('monster-hits', 'plain');

      if (theirs.outcome !== 'Fighting') await finish(theirs, foe);
    } catch (error) {
      if (!isClosed(error)) setNote('That move did not land. The garden is still here.');
    } finally {
      setBusy('idle');
    }
  }, [monster, progress, finish, kit]);

  /**
   * One tap of the action bar: log it, pay it, then swing.
   *
   * The order is the point. The wellness row is written first and unconditionally
   * — it is the thing that actually matters, and a fight that fails should not
   * cost somebody their workout. The XP and the swing follow.
   */
  const onAct = useCallback(async (action: ActionDto) => {
    if (busy !== 'idle' || !memberId || !coupleId) return;

    if (action.activity) {
      setBusy('logging');
      try {
        await logActivity(action.activity, memberId, day);
        // One award per activity per day, so tapping "Log Mood" eight times in a
        // fight pays once — the same shape as the row it writes, which upserts
        // on [memberId+day].
        const award = await client.current?.award(action.activity, petXp);
        if (award && award.xp > 0) {
          await awardPetXp(coupleId, `garden-${day}-${action.activity}`, award.xp);
        }
      } catch (error) {
        if (!isClosed(error)) setNote('That did not save. Try the log page.');
      } finally {
        setBusy('idle');
      }
    }

    if (battle?.outcome === 'Fighting') await playRound(battle, action.id);
  }, [busy, memberId, coupleId, day, petXp, battle, playRound]);

  const onFlee = useCallback(() => {
    if (battle?.outcome === 'Fighting') void playRound(battle, 'flee');
  }, [battle, playRound]);

  const onTravel = useCallback(async (to: number) => {
    if (!coupleId) return;
    await travelToIsland(coupleId, to);
    setMapOpen(false);
    setBattle(null);
  }, [coupleId]);

  const islandDto = islands.find((i) => i.number === island);
  const islandName = islandDto
    ? (dark ? islandDto.darkName : islandDto.lightName)
    : 'Eve’s Garden';

  const nextIslandName = useMemo(() => {
    if (island >= ISLAND_COUNT) return null;
    const next = islands.find((i) => i.number === island + 1);
    return next ? (dark ? next.darkName : next.lightName) : null;
  }, [islands, island, dark]);

  /**
   * The gate, instead of the garden.
   *
   * Rendered as a `return` rather than as an overlay, which is the whole reason
   * the two effects above can be guarded on `companion` — an overlay would mean
   * the canvas and the WebAssembly runtime were already up behind it.
   *
   * `onCancel` is absent on a first visit on purpose: there is nothing behind
   * the gate yet to go back to, and a dead "Not yet" is worse than none.
   */
  if (!companion) {
    if (!gate) return <section className="page garden" aria-busy="true" />;
    return (
      <RaidGate
        cards={gate.cards}
        verdict={gate.verdict}
        hour={new Date().getHours()}
        dark={dark}
        resonance={resonance}
        petLevel={petLevel}
        onEnter={onEnter}
      />
    );
  }

  return (
    <section className={`page garden${dark ? ' is-dark' : ''}`}>
      <div className="garden-top">
        <Compass
          islandNumber={island}
          islandName={islandName}
          stage={stage}
          progress={islandProgress(world)}
          dark={dark}
          onOpenMap={() => setMapOpen(true)}
        />
        <button
          type="button"
          className="garden-companion"
          onClick={() => openGate(true)}
          title={`${kit.mascot} · ${kit.signature.name}`}
        >
          <span className="garden-companion-name">{kit.mascot}</span>
          <span className="garden-companion-swap">Change</span>
        </button>
      </div>

      {note && <p className="section-sub garden-note">{note}</p>}

      <div className="garden-stage-wrap">
        {/* Behind the canvas, which is transparent so this shows through — see
            the header of `GardenBackdrop`. */}
        {/* Radiance is the couple's glow — it dims towards a floor it never
            falls through and brightens the moment either of you logs. Reading
            the weather off it means a quiet fortnight is soft rain and a warm
            week is open flowers, and neither is ever a harder fight. */}
        <GardenBackdrop
          hour={new Date().getHours()}
          dark={dark}
          mood={vitals ? vitals.radiance / RADIANCE_FULL : 0.6}
          resonance={resonance}
        />

        {/* The canvas sits inside the page rather than fixed or portalled, so the
            tab bar, the status strip and the chat panel all keep working over it. */}
        <div className="garden-stage" ref={host} aria-label={islandName} role="img" />

        {flourish && (
          <p className="garden-flourish" role="status" key={flourish}>
            {flourish}
          </p>
        )}

        <WellnessCards
          progress={progress}
          vitals={vitals}
          daysSinceLog={momentum?.daysSinceLog ?? 0}
          dark={dark}
        />

        <BattleLog battle={battle} monster={monster} />
      </div>

      <ActionBar
        actions={progress?.actions ?? []}
        allActions={allActions}
        battle={battle}
        monster={monster}
        level={progress?.level ?? 1}
        busy={busy !== 'idle'}
        onAct={(action) => { void onAct(action); }}
        onFlee={onFlee}
      />

      <p className="section-sub garden-hint">
        Arrow keys or WASD to walk; on a phone, tap a tile beside you. Walk into
        something to start a fight — walking away from one costs nothing.
      </p>

      {mapOpen && (
        <WorldMap
          islands={islands}
          progress={world}
          dark={dark}
          onTravel={(to) => { void onTravel(to); }}
          onClose={() => setMapOpen(false)}
        />
      )}

      {victory && (
        <VictoryBanner
          monster={victory.monster}
          xp={victory.xp}
          leveledUp={victory.leveledUp}
          level={victory.level}
          rewardText={victory.rewardText}
          islandComplete={isIslandComplete(world, island)}
          nextIslandName={nextIslandName}
          onDismiss={() => { setVictory(null); setBattle(null); }}
        />
      )}
    </section>
  );
}
