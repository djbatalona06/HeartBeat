import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, loadSettings } from '../../db/database';
import {
  awardPetXp, buyFlora, chooseRaidCompanion, clearStageFor, coupleVitals, ensureIdentity,
  gardenMomentum, loadWorldProgress, openChestFor, openRaidGate, ownedFlora, plantFlora,
  recordRaidRounds, todaysCharges, travelToIsland,
} from '../../db/repository';
import { todayKey } from '../../domain/day';
import { levelForXp } from '../../domain/xp';
import { milestonesAt } from '../../domain/rpg/milestones';
import { spriteKeyForTheme } from '../../domain/rpg/sprites';
import { RADIANCE_FULL } from '../../domain/rpg/vitals';
import { levelOf, sheetFor } from '../../domain/rpg/avatar';
import { gearBonusWithRefinement } from '../../domain/rpg/shop';
import { refineByItemId } from '../../domain/rpg/inventory';
import type { Garden } from '../../domain/rpg/plots';
import type { House } from '../../domain/rpg/furniture';
import { holdingsLoadout, loadoutSheet } from '../../domain/rpg/loadout';
import { chargeOnWeakness, gardenAwardId, payingActivities } from '../../domain/rpg/charges';
import { bossOf, faceOf } from '../../domain/rpg/islands';
import { fireSkill, kitFor, moveKeyFor, moveNamesFor } from '../../domain/rpg/companionSkills';
import type { GateCard, GateVerdict } from '../../domain/rpg/raidGate';
import { variantFor } from '../../domain/rpg/diorama';
import {
  ISLAND_COUNT, currentStage, isIslandComplete, islandProgress, standingIsland,
  newWorldProgress, type WorldProgress,
} from '../../domain/rpg/world';
import { createGameClient, isClosed, type GameClient } from './engine/client';
import type {
  ActionDto, BattleDto, Charge, DioramaTheme, IslandDto, MonsterDto, ProgressDto,
} from './engine/types';
import type { SceneHandle, StepResult } from './scene/events';
import { DirectionPad } from './DirectionPad';
import { buzz } from '../../pwa/haptics';
import { useTheme } from '../../themes/ThemeProvider';
import {
  blocksPlay, faultCopy, faultFrom, needsTextMode, type GardenFault,
} from './fault';
import { NotHere } from '../errors/NotHere';
import { GardenBackdrop } from './GardenBackdrop';
import { GardenPlaces } from './GardenPlaces';
import { GardenDrawer } from './GardenDrawer';
import { PRIZES_PER_CHEST } from '../../domain/rpg/chests';
import type { ChestOutcome } from '../../db/repository/chests';
import { ChestReveal } from '../chest/ChestReveal';
import { openingLine } from '../chest/receipt';
import { GardenHabitat } from './GardenHabitat';
import { RaidGate } from './gate/RaidGate';
import { Compass } from './Compass';
import { WorldMap } from './WorldMap';
import { WellnessCards } from './WellnessCards';
import { BattleLog } from './BattleLog';
import { ActionBar } from './ActionBar';
import { ChargeMeter } from './ChargeMeter';
import { VictoryBanner } from './VictoryBanner';
import { Icon } from '../../components/icons';

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
 * curve unlocks. `Progression.XpForLevel(34)` is 19825; this only has to be more
 * than that and to fit in an `int`.
 */
const TOP_OF_THE_CURVE = 1_000_000;

type Busy = 'idle' | 'acting';

export function EveGardenPage() {
  const host = useRef<HTMLDivElement | null>(null);
  const scene = useRef<SceneHandle | null>(null);
  const client = useRef<GameClient | null>(null);

  const settings = useLiveQuery(loadSettings, []);
  const { calm } = useTheme();
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
  // Today's logging, as the fight reads it. The garden has no logging controls:
  // every charge lights from a row another page wrote.
  const lit = useLiveQuery(() => todaysCharges(day), [day]);
  const charges: Charge[] = useMemo(() => lit ?? [], [lit]);
  const pet = useLiveQuery(() => (coupleId ? db.pet.get(coupleId) : undefined), [coupleId]);
  const stored = useLiveQuery(
    () => (coupleId ? loadWorldProgress(coupleId) : undefined),
    [coupleId],
  );
  // The wallet, the bag and what is already in the ground. Read here rather
  // than inside the drawer so the drawer stays a component that is handed
  // things — the same arrangement every other panel on this page has.
  const avatar = useLiveQuery(
    () => (memberId ? db.avatars.get(memberId) : undefined),
    [memberId],
  );
  const bag = useLiveQuery(
    () => (memberId ? db.inventory.where('memberId').equals(memberId).toArray() : []),
    [memberId],
  );
  const planted = useLiveQuery(
    () => (memberId ? ownedFlora(memberId) : []),
    [memberId],
  );
  const residents = useLiveQuery(
    () => (memberId ? db.pets.where('memberId').equals(memberId).toArray() : []),
    [memberId],
  );

  const world: WorldProgress = stored ?? newWorldProgress(coupleId ?? 'unpaired', Date.now());
  const theme: DioramaTheme = momentum ? variantFor(momentum) : 'Light';
  const dark = theme === 'Dark';

  const island = standingIsland(world);
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
  // The chest the drawer just opened, while it is still being looked at. The
  // same reveal the Shop tab renders -- a second one would be a second chance
  // to describe a duplicate as nothing.
  const [revealed, setRevealed] = useState<Extract<ChestOutcome, { ok: true }> | null>(null);

  /**
   * What is broken, if anything — and separate from `note`, which is the
   * drawer's own feedback ("Rose planted.", "Not enough coins.") and is as
   * often good news as bad.
   *
   * See `fault.ts` for why this replaced three `.catch(() => {})`. The short
   * version: one of them swallowed the failure that left the canvas unmounted,
   * so the screen's worst bug had no way of reaching the screen.
   */
  const [fault, setFault] = useState<GardenFault | null>(null);
  /** Bumped by "Try again". In every effect's deps, so retrying re-runs them. */
  const [reload, setReload] = useState(0);
  const retry = useCallback(() => {
    setFault(null);
    setReload((n) => n + 1);
  }, []);

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
  /** Bumped every time a log lands, so the habitat reacts to the couple doing
   *  something. State rather than a ref: the reaction *is* a re-render. */
  const [pulse, setPulse] = useState(0);

  const openGate = useCallback((askedToChange = false) => {
    let live = true;
    openRaidGate({ askedToChange })
      .then((next) => { if (live) { setGate(next); setCompanion(null); } })
      // The earliest thing that can fail, and it used to fail silently: `gate`
      // stayed null and the screen waited on it forever. Now that waiting has a
      // skeleton, staying silent here would be a prettier version of the same
      // bug rather than a fix for it.
      .catch((error) => { if (live) setFault(faultFrom('gate', error)); });
    return () => { live = false; };
  }, []);

  // `reload` is in the deps so "Try again" on a gate fault actually re-opens the
  // gate. `openGate` itself is stable, so this only ever re-runs on a retry.
  useEffect(() => openGate(false), [openGate, reload]);

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
  /** Both ids resolved. The drawer writes, so it must not render before it
   *  knows who is writing — a planted rose keyed to `undefined` is a lost one. */
  const identityReady = Boolean(memberId && coupleId);
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

  const garden = (pet?.plots ?? {}) as Garden;
  /** Luck, derived the one way the whole app derives it — including refinement,
   *  because odds printed without it are odds nobody actually has. */
  const luck = avatar
    ? sheetFor(
      avatar,
      gearBonusWithRefinement(avatar.gear, levelOf(avatar), refineByItemId(bag ?? [])),
    ).stats.luck
    : 0;

  /**
   * The raid sheet the fight uses: gear, room, dye, companion, garden and the
   * mascot at the gate. The same assembly the party page's sheet shows, so the
   * numbers there are the numbers here. Handed to C# once, when a fight begins.
   */
  const sheet = useMemo(() => loadoutSheet(holdingsLoadout({
    avatar,
    owned: bag ?? [],
    petXp,
    house: (pet?.house ?? {}) as House,
    garden,
    pets: residents ?? [],
    mascot: gate?.cards.find((card) => card.themeId === companion)?.source,
  })), [avatar, bag, petXp, pet?.house, garden, residents, gate, companion]);
  const moveNames = useMemo(() => moveNamesFor(kit), [kit]);

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
        if (live) setFault(faultFrom('engine', error));
      });

    return () => {
      live = false;
      game.close();
      client.current = null;
    };
  }, [companion, reload]);

  /* ---- level and unlocked actions, recomputed when the pet's XP moves ---- */

  useEffect(() => {
    const game = client.current;
    if (!game) return undefined;
    let live = true;
    game.progress(petXp)
      .then((next) => { if (live) setProgress(next); })
      // Was `.catch(() => {})`. A silent failure here empties the action bar,
      // which looks like a level that unlocked nothing rather than like a
      // screen that did not load.
      .catch((error) => { if (live) setFault(faultFrom('stage', error)); });
    return () => { live = false; };
    // `companion` because the client above only exists once one is picked. On
    // first mount the gate is up, this runs, finds no client and returns; the
    // pick then starts the worker, and without `companion` here nothing asks
    // again. The garden sat on "Waking the garden…" for every fresh visit.
  }, [petXp, companion, reload]);

  /* ---- which monster is standing on this stage ---- */

  useEffect(() => {
    const game = client.current;
    if (!game) return undefined;
    let live = true;
    game.stage(island, stage, theme)
      .then((dto) => { if (live) setMonster(dto?.monster ?? null); })
      /**
       * **This is the one that hid the bug.**
       *
       * It was `.catch(() => {})`. `sprite` below is `monster?.spriteKey` and
       * `sprite` gates the Phaser mount, so a rejection here left `monster`
       * null, left `sprite` undefined, and the canvas never mounted — with no
       * note and no `aria-busy` to say so. An empty `.garden-stage` is exactly
       * what loading looks like, so the screen sat there forever looking busy.
       */
      .catch((error) => { if (live) setFault(faultFrom('stage', error)); });
    return () => { live = false; };
    // `companion` for the same reason as the progress effect above: the client
    // is created by the gate's pick, which changes none of the other deps.
  }, [island, stage, theme, companion, reload]);

  /* ---- the canvas ---- */

  const onEngage = useCallback(() => {
    const game = client.current;
    if (!game || !progress || !monster) return;
    game.beginBattle(island, stage, theme, progress.level, Date.now(), charges, sheet.total)
      .then((next) => setBattle(next ? { ...next, moveNames } : next))
      // Was silent, which made walking into a monster and having nothing happen
      // indistinguishable from having missed the tile.
      .catch((error) => setFault(faultFrom('round', error)));
  }, [island, stage, theme, progress, monster, charges, sheet, moveNames]);

  // The scene is rebuilt when the stage or the island's face changes, and at no
  // other time. `onEngage` is deliberately absent from the dependencies: it
  // closes over state that settles, and rebuilding the whole canvas when it
  // changes would tear the garden down mid-walk. The scene reads it through a
  // ref that the effect below keeps current.
  const engageRef = useRef(onEngage);
  engageRef.current = onEngage;

  const sprite = monster?.spriteKey;

  /**
   * Whether the fight is read rather than watched.
   *
   * Two entrances, one room. Somebody who turned "Resolve quickly" on in
   * Settings gets it deliberately; somebody whose Phaser chunk would not load
   * gets it as a fallback. Deliberately the same path — `crate.js:1127` in the
   * gift makes the argument, that "a fallback that behaves differently is a
   * second thing to learn", and the version used on purpose by one person is
   * the version that has been proven for the other.
   *
   * It costs almost nothing: `BattleLog` and `ActionBar` are already pure DOM
   * with no Phaser import, and `BattleLog` is already rendered on every visit.
   */
  const textMode = settings?.resolveQuickly === true || needsTextMode(fault);

  useEffect(() => {
    // Chosen text mode never reaches for the chunk at all, so the megabyte is
    // not merely unused — it is not fetched.
    if (textMode) return undefined;
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
      // Not fatal, and that is the point: the engine is fine, so the fight is
      // fine. `needsTextMode` turns this into the DOM battle rather than an
      // apology.
      .catch((error) => { if (live) setFault(faultFrom('scene', error)); });

    return () => {
      live = false;
      scene.current?.destroy();
      scene.current = null;
    };
  }, [island, stage, sprite, petSprite, companion, dark, textMode, reload]);

  /**
   * Stop rendering while the tab is hidden.
   *
   * A backgrounded garden kept a rAF loop and an Arcade physics step running
   * over a canvas nobody could see. `sleep`/`wake` rather than teardown, so
   * coming back does not re-read the stage or walk the pet home — see
   * `SceneHandle.pause`.
   */
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) scene.current?.pause();
      else scene.current?.resume();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  /* ---- a round ---- */

  /** How a hit should look: strong when today's logging is on its weakness, as C# priced it. */
  function edgeOf(foe: MonsterDto | null) {
    return chargeOnWeakness(charges, foe?.weakness) ? 'strong' as const : 'plain' as const;
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

    /**
     * What the *pet's* level crossing was worth, if it crossed one.
     *
     * Deliberately read off `domain/xp.ts` rather than off the C# progress
     * above. Those are two different numbers on purpose — C# owns the combat
     * rank that gates the action bar and is pinned by the island simulation,
     * while the pet's level is the fifty-rung curve the couple actually climbs
     * — and the milestones hang off the second one. Taking the reward line
     * from the first would have announced a plot opening on the wrong level.
     */
    const petLevelBefore = levelForXp(petXp);
    const petLevelAfter = levelForXp(petXp + ended.xpOwed);
    const crossed = petLevelAfter > petLevelBefore
      ? milestonesAt(petLevelAfter)
      : [];

    setVictory({
      monster: foe,
      xp: ended.xpOwed,
      leveledUp: petLevelAfter > petLevelBefore,
      level: petLevelAfter,
      rewardText: crossed.length > 0
        ? crossed.map((entry) => `${entry.name}. ${entry.blurb}`).join(' ')
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
      // The charges are the one thing the page updates on a battle in flight:
      // a workout logged between turns lands on the very next swing.
      const mine = await game.act({ ...opening, charges, moveNames }, actionId);
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
        const move = action ? moveKeyFor(action.style) : undefined;
        if (move) {
          const verdict = fireSkill(kit, move, {
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

        await scene.current?.strike('player-hits', action?.type === 'Attack' ? edgeOf(foe) : 'plain');
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
      setFault(faultFrom('round', error));
    } finally {
      setBusy('idle');
    }
  }, [monster, progress, finish, kit, charges, moveNames]);

  /** One tap of the move bar. A move is a move: nothing is logged by it. */
  const onAct = useCallback(async (action: ActionDto) => {
    if (busy !== 'idle') return;
    if (battle?.outcome === 'Fighting') await playRound(battle, action.id);
  }, [busy, battle, playRound]);

  /**
   * Each lit charge pays its XP once a day, the first time the garden sees it.
   *
   * The strip that used to log from here also paid for it; with logging moved
   * to the pages that own it, this keeps that income without a second write
   * path. The award id is the day and the activity, never the phone, so both
   * partners' gardens seeing the same "rested" pay it once — `awardPetXp`
   * dedups on it. `companion` is in the deps for the reason CLAUDE.md gives:
   * the client only exists after the gate's pick.
   */
  const paid = useRef(new Set<string>());
  useEffect(() => {
    const game = client.current;
    if (!game || !coupleId) return;
    const owed = payingActivities(charges)
      .map((activity) => ({ activity, awardId: gardenAwardId(day, activity) }))
      .filter(({ awardId }) => !paid.current.has(awardId) && !(pet?.awardedXpIds ?? []).includes(awardId));
    if (owed.length === 0) return;

    (async () => {
      let xp = petXp;
      for (const { activity, awardId } of owed) {
        paid.current.add(awardId);
        const award = await game.award(activity, xp);
        if (award.xp > 0) {
          await awardPetXp(coupleId, awardId, award.xp);
          xp += award.xp;
          setPulse((n) => n + 1);
        }
      }
    })().catch((error) => { if (!isClosed(error)) setNote('A charge did not pay out. It will try again.'); });
  // `petXp` and `pet` are read, not watched: an award moving them must not
  // re-run this, and the `paid` set is what stops a second payment anyway.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charges, day, coupleId, companion]);

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
    // The last island has no next one, so the banner says there is no
    // further to go rather than naming one as open.
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
  /**
   * A fault with nothing behind it, as the whole screen.
   *
   * **Before the gate branch below, deliberately.** `blocksPlay` covers the
   * gate failing to open, and the gate branch renders a skeleton whenever
   * `gate` is null — so checking this second would show a spinner for a gate
   * that is never coming, which is the exact bug this whole change is about.
   *
   * It is the same page the unknown-route handler uses, because "this did not
   * load" and "this is not here" are the same news to the person reading it.
   */
  if (blocksPlay(fault)) {
    const copy = faultCopy(fault!);
    return (
      <NotHere
        title={copy.title}
        body={copy.body}
        onRetry={copy.retry ? retry : undefined}
        homeTo="#/"
        homeLabel="Back to the app"
      />
    );
  }

  if (!companion) {
    // Was an empty `<section aria-busy>`, which is a blank screen with a
    // promise attached. The skeleton says the same thing to a screen reader and
    // something to everyone else.
    if (!gate) {
      return (
        <section className="page garden" aria-busy="true">
          <p className="visually-hidden" role="status">Opening the gate…</p>
          <div className="skeleton skeleton-gate" aria-hidden="true" />
          <div className="skeleton skeleton-line" aria-hidden="true" />
          <div className="skeleton skeleton-line skeleton-line-short" aria-hidden="true" />
        </section>
      );
    }
    return (
      <RaidGate
        cards={gate.cards}
        verdict={gate.verdict}
        hour={new Date().getHours()}
        dark={dark}
        resonance={resonance}
        petLevel={petLevel}
        world={world}
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
          bossName={faceOf(bossOf(island), dark).name}
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
          <span className="garden-companion-swap"><Icon name="bird" />Change</span>
        </button>
      </div>

      {note && <p className="section-sub garden-note">{note}</p>}

      {/* A fault the garden survives. Inline and quiet, because the screen still
          works — a full-page apology for a missing picture would be louder than
          the problem. `role="status"` so it is announced without stealing focus
          mid-fight. */}
      {fault && !blocksPlay(fault) && (
        <p className="garden-note garden-note-fault" role="status">
          <span className="garden-note-title">{faultCopy(fault).title}</span>{' '}
          {faultCopy(fault).body}
          {faultCopy(fault).retry && (
            <button type="button" className="quiet garden-note-retry" onClick={retry}>
              Try the picture again
            </button>
          )}
        </p>
      )}

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
          garden={garden}
          petLevel={petLevel}
        />

        {/* The canvas sits inside the page rather than fixed or portalled, so the
            tab bar, the status strip and the chat panel all keep working over it.

            Three states now, not one. In text mode there is no host at all —
            which is also what keeps the effect above from mounting, since it
            bails on `host.current`. While the engine is still answering there
            is a skeleton, because the empty host and a loading host used to be
            the same pixels. */}
        {textMode ? null : sprite ? (
          <div className="garden-stage-box">
            <div className="garden-stage" ref={host} aria-label={islandName} role="img" />
            {/* Walking only: in a fight the move pad is the controller, and a
                second one beside it would be a pad that does nothing. */}
            {battle?.outcome !== 'Fighting' && (
              <DirectionPad
                onStep={(dx, dy): StepResult => scene.current?.step(dx, dy) ?? 'busy'}
                onResult={(result) => {
                  if (result === 'moved') buzz('tap', { calm, enabled: settings?.haptics !== false });
                  else if (result === 'blocked') buzz('error', { calm, enabled: settings?.haptics !== false });
                }}
              />
            )}
          </div>
        ) : (
          <div className="garden-stage" aria-busy="true">
            <div className="skeleton skeleton-stage" aria-hidden="true" />
            <p className="visually-hidden" role="status">Waking the garden…</p>
          </div>
        )}

        {/* The companions you did not bring, living here anyway. Over the
            backdrop and under the canvas, which is where a background animal
            belongs. */}
        <GardenHabitat
          pets={residents ?? []}
          activeKindId={avatar?.companionId
            ? (residents ?? []).find((p) => p.id === avatar.companionId)?.kindId
            : undefined}
          pulse={pulse}
        />

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

      {/* The controller: the move pad on the left, today's charges on the right,
          side by side on every width. The meter is a picture of the day, never
          a control — logging happens on the pages that own it. */}
      <div className="garden-controls">
        <ActionBar
          actions={progress?.actions ?? []}
          allActions={allActions}
          battle={battle}
          monster={monster}
          level={progress?.level ?? 1}
          busy={busy !== 'idle'}
          kit={kit}
          charges={charges}
          stats={sheet.total}
          onAct={(action) => { void onAct(action); }}
          onFlee={onFlee}
        />
        <ChargeMeter charges={charges} weakness={monster?.weakness} />
      </div>

      {/* The alcove and the plots, in the garden. The plan asked for the chest
          alcove to be part of the garden's architecture rather than a separate
          screen, and this is the same ChestAlcove the Shop tab renders — not a
          copy, because two sets of published odds is two chances to publish a
          number that is not the number. */}
      {identityReady && (
        <GardenDrawer
          garden={garden}
          petLevel={petLevel}
          coins={avatar?.coins ?? 0}
          luck={luck}
          chestPity={avatar?.chestPity ?? {}}
          ownedFlora={planted ?? []}
          busy={busy !== 'idle'}
          onPlant={async (plotId, floraId) => {
            const result = await plantFlora(memberId!, coupleId!, plotId, floraId);
            if (!result.ok) setNote(result.reason ?? null);
          }}
          onBuyFlora={async (floraId) => {
            const result = await buyFlora(memberId!, coupleId!, floraId);
            setNote(result.ok ? null : result.reason ?? null);
          }}
          onOpenChest={async (chestId) => {
            // One roll set per item in the chest. See `openChestFor`.
            const result = await openChestFor(
              memberId!, coupleId!, chestId,
              Array.from({ length: PRIZES_PER_CHEST }, () => ({
                tier: Math.random(), kind: Math.random(),
                stat: Math.random(), pick: Math.random(),
              })),
            );
            if (!result.ok) { setNote(result.reason); return; }
            setRevealed(result);
          }}
        />
      )}

      <GardenPlaces companion={kit.mascot} onChangeCompanion={() => openGate(true)} />

      <p className="section-sub garden-hint">
        Arrow keys, WASD or the pad to walk, or tap a tile beside you. Walk into
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

      {/* After the victory banner, because a chest is opened from the drawer
          and never in the middle of a fight, so the two cannot both be up. */}
      {revealed ? (
        <ChestReveal
          outcome={revealed}
          onDismiss={() => { setNote(openingLine(revealed)); setRevealed(null); }}
        />
      ) : null}
    </section>
  );
}
