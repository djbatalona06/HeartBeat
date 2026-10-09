import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, loadSettings } from '../../db/database';
import {
  awardPetXp, chooseRaidCompanion, clearStageFor, coupleVitals, ensureIdentity,
  gardenMomentum, loadWorldProgress, openRaidGate,
  recordMinionWin, recordRaidRounds, settleGardenClear, spinBossWheel, stampGatePresence, todaysCharges, travelToIsland,
} from '../../db/repository';
import { todayKey } from '../../domain/day';
import { levelForXp } from '../../domain/xp';
import { milestonesAt } from '../../domain/rpg/milestones';
import { strikePlan } from '../../domain/scene/strikePlan';
import { spriteKeyForTheme } from '../../domain/rpg/sprites';
import { RADIANCE_FULL } from '../../domain/rpg/vitals';
import type { Garden } from '../../domain/rpg/plots';
import type { House } from '../../domain/rpg/furniture';
import { holdingsLoadout, loadoutSheet } from '../../domain/rpg/loadout';
import { chargeOnWeakness, gardenAwardId, payingActivities } from '../../domain/rpg/charges';
import { bossOf, faceOf } from '../../domain/rpg/islands';
import { arenaFor } from '../../domain/rpg/arena';
import { isMinionId, minionsOnStage } from '../../domain/rpg/minions';
import { fireSkill, kitFor, moveKeyFor, moveNamesFor } from '../../domain/rpg/companionSkills';
import {
  NO_BONUS, PRESENCE_REFRESH_MS, allyThemeId, bossEntryBlockedBecause, gateCards, partnerAtGate, partnerGateApplies,
  togetherBonus, togetherXp, type GateCard, type GateVerdict, type TogetherBonus,
} from '../../domain/rpg/raidGate';
import { partnerOf } from '../pairing/namingGate';
import { variantFor } from '../../domain/rpg/diorama';
import {
  ISLAND_COUNT, currentStage, isIslandComplete, islandProgress, standingIsland,
  STAGES_PER_ISLAND, islandOfMonster, newWorldProgress, stageOfMonster, type WorldProgress,
} from '../../domain/rpg/world';
import { createGameClient, isClosed, type GameClient } from './engine/client';
import type {
  ActionDto, BattleDto, Charge, DioramaTheme, IslandDto, MonsterDto, ProgressDto,
} from './engine/types';
import type { SceneHandle, StepResult } from './scene/events';
import { DirectionPad } from './DirectionPad';
import { buzz } from '../../pwa/haptics';
import { useWakeLock } from '../../pwa/useWakeLock';
import { useTheme } from '../../themes/ThemeProvider';
import {
  blocksPlay, faultCopy, faultFrom, needsTextMode, type GardenFault,
} from './fault';
import { NotHere } from '../errors/NotHere';
import { GardenBackdrop } from './GardenBackdrop';
import { GardenHabitat } from './GardenHabitat';
import { RaidGate } from './gate/RaidGate';
import { BossGatePrompt } from './gate/BossGatePrompt';
import { REGATE_DELAY_MS, backToTheGate, promptApplies } from '../../domain/rpg/gatePrompt';
import { starMilestone } from '../../domain/rpg/starChests';
import { REDRIVE_DELAY_MS, settle, shouldRedriveMonster } from './round';
import { blowsFor, monsterMissed } from '../../domain/rpg/behaviours';
import { Compass } from './Compass';
import { WorldMap } from './WorldMap';
import { BattleLog } from './BattleLog';
import { ActionBar, ActionHint } from './ActionBar';
import { ChargeMeter } from './ChargeMeter';
import { VictoryBanner } from './VictoryBanner';
import { SpinOffer } from '../wheel/SpinOffer';
import { loadArenaFloor } from './arenaFloor';
import { arenaTokensForPet } from './arenaTheme';
import { Icon } from '../../components/icons';
import { InfoBubble } from '../../ui/InfoBubble';
import { GUIDES } from '../guide/guides';

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
  const { calm, mode } = useTheme();
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
  // The wallet and the bag, for the raid sheet the fight is priced with.
  const avatar = useLiveQuery(
    () => (memberId ? db.avatars.get(memberId) : undefined),
    [memberId],
  );
  const bag = useLiveQuery(
    () => (memberId ? db.inventory.where('memberId').equals(memberId).toArray() : []),
    [memberId],
  );
  const residents = useLiveQuery(
    () => (memberId ? db.pets.where('memberId').equals(memberId).toArray() : []),
    [memberId],
  );

  const members = useLiveQuery(
    () => (coupleId ? db.members.where('coupleId').equals(coupleId).toArray() : []),
    [coupleId],
  );
  const partner = partnerOf(members, { coupleId, memberId });
  // The partner's avatar carries their last garden pick (`raidCompanion`) and,
  // before they have made one, the mascot their app draws.
  const partnerAvatar = useLiveQuery(
    () => (partner ? db.avatars.get(partner.id) : undefined),
    [partner?.id],
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
  /**
   * The island skirmish being fought, while one is. It stands in for `monster`
   * everywhere a fight reads its foe (`opponent` below), and is never a stage:
   * nothing here clears, counts or pays like one.
   */
  const [skirmish, setSkirmish] = useState<{ stage: number; monster: MonsterDto } | null>(null);
  const opponent = skirmish?.monster ?? monster;
  /**
   * Log lines (by index; the log is append-only) whose hit landed on the
   * monster's weakness. C# names the move and the damage; whether a charge was
   * on the weakness is decided here by `edgeOf`, so the log learns it here.
   */
  const [weakHits, setWeakHits] = useState<readonly number[]>([]);
  const [battle, setBattle] = useState<BattleDto | null>(null);
  // A fight is watched as much as touched: don't let the phone dim mid-round.
  useWakeLock(battle?.outcome === 'Fighting');
  const [busy, setBusy] = useState<Busy>('idle');
  const [mapOpen, setMapOpen] = useState(false);
  const [victory, setVictory] = useState<
    { monster: MonsterDto; xp: number; leveledUp: boolean; level: number; rewardText: string; lootText: string } | null
  >(null);
  const [note, setNote] = useState<string | null>(null);

  /**
   * What is broken, if anything — and separate from `note`, which is the
   * page's own feedback and is as often good news as bad.
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
  /**
   * False only after the Boss Gate was last answered "solo": the partner gate is
   * then ignored -- no presence is stamped, none is read, no bonus is held.
   * Asked again on every attempt at a boss (`asking`), never remembered.
   */
  const [party, setParty] = useState(true);
  const [asking, setAsking] = useState(false);
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
      .then((next) => {
        if (!live) return;
        setGate(next);
        setCompanion(null);
        // Nothing of the last fight may survive a trip through the gate: a
        // stale battle would be handed to a worker that has just been torn down.
        setBattle(null);
        setWeakHits([]);
        setVictory(null);
        setMapOpen(false);
      })
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

  /**
   * The partner gate exists on a boss stage and nowhere else. Stages 1-6 are
   * asynchronous: no stamp is written, none is read, and nothing waits.
   */
  const bossStage = partnerGateApplies(stage);
  const partnerPresent = bossStage && party && partnerAtGate(world.gate, partner?.id, Date.now());
  const atGate = !companion && gate !== null;
  useEffect(() => {
    if (!party || !atGate || !bossStage || !coupleId || !memberId || !partner) return undefined;
    void stampGatePresence(coupleId, memberId).catch(() => {});
    const timer = setInterval(() => {
      void stampGatePresence(coupleId, memberId).catch(() => {});
    }, PRESENCE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [party, atGate, bossStage, coupleId, memberId, partner]);

  /** Who was ringed before "Change", so "Not yet" can put them back. */
  const cameFrom = useRef<string | null>(null);
  /** What going in together is worth, decided as the fight is entered and held for it. */
  const together = useRef<TogetherBonus>(NO_BONUS);

  const onEnter = useCallback((themeId: string) => {
    together.current = togetherBonus(stage, partnerPresent);
    cameFrom.current = null;
    setCompanion(themeId);
    rounds.current = 0;
    cooldowns.current = {};
    spent.current = new Set();
    setFlourish(null);
    void chooseRaidCompanion(themeId);
  }, [stage, partnerPresent]);

  const petXp = pet?.xp ?? 0;
  const petLevel = levelForXp(petXp);
  /**
   * The five cards, priced at the couple's level so each is worth the same.
   * `gate.cards` (read once, off the affinity ledger) only decides whether the
   * gate opens; what is *shown* and what the fight is *handed* come from here,
   * which follows the level live — one assembly, so the number on the card is
   * the number in the fight.
   */
  const cards = useMemo(() => gateCards({ petLevel }), [petLevel]);
  const kit = useMemo(() => kitFor(companion ?? undefined), [companion]);
  const petSprite = spriteKeyForTheme(companion ?? undefined);
  /**
   * The second pedestal: the partner's last pick, else their mascot, else the
   * default bird -- a partner whose app has not written either yet still
   * stands beside you. None after a "solo" answer, or with no partner.
   */
  const allySprite = party && partner
    ? spriteKeyForTheme(allyThemeId(partnerAvatar))
    : undefined;
  // Not a dep of the scene: a new pick mid-fight would tear down a running
  // Phaser game. Handed over live instead, and read when a scene starts.
  const allyRef = useRef(allySprite);
  useEffect(() => {
    allyRef.current = allySprite;
    scene.current?.setAlly(allySprite);
  }, [allySprite]);

  // The warning sign over the monster: shown while it is your turn and the
  // game core says something is coming, cleared the moment it is not. Pushed to
  // the scene rather than drawn from React, because Phaser owns the canvas.
  // `companion` is a dep for the reason the Raid Gate note in CLAUDE.md gives:
  // the scene only exists after the gate's pick.
  const warning = battle?.outcome === 'Fighting' && battle.turn === 'Player' ? battle.telegraph ?? null : null;
  useEffect(() => {
    scene.current?.telegraph(warning);
  }, [warning, companion]);

  /**
   * How full the tether is.
   *
   * Read off the couple's momentum rather than stored, for the reason nothing
   * derived is stored anywhere in this app: a saved combo meter is a second
   * copy of the logs that can disagree with them, and the copy is always the
   * one on screen.
   */
  const resonance = Math.min(1, Math.max(0, 1 - (momentum?.daysSinceLog ?? 0) / 7));

  const garden = useMemo(() => (pet?.plots ?? {}) as Garden, [pet?.plots]);

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
    mascot: cards.find((card) => card.themeId === companion)?.source,
  })), [avatar, bag, petXp, pet?.house, garden, residents, cards, companion]);
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

  const begin = useCallback((minionStage?: number) => {
    const game = client.current;
    if (!game || !progress || !monster) return;
    const fight = (at: number) => game
      .beginBattle(island, at, theme, progress.level, Date.now(), charges, sheet.total)
      .then((next) => {
        setWeakHits([]);
        setBattle(next ? { ...next, moveNames } : next);
      });

    // A skirmish is addressed as a stage number past the island's seven, so the
    // only difference to a fight is which dto stands in for the foe.
    let started: Promise<unknown>;
    if (minionStage === undefined) {
      setSkirmish(null);
      started = fight(stage);
    } else {
      started = game.stage(island, minionStage, theme).then((dto) => {
        if (!dto) return undefined;
        setSkirmish({ stage: minionStage, monster: dto.monster });
        return fight(minionStage);
      });
    }
    // Was silent, which made walking into a monster and having nothing happen
    // indistinguishable from having missed the tile.
    started.catch((error) => setFault(faultFrom('round', error)));
  }, [island, stage, theme, progress, monster, charges, sheet, moveNames]);

  // Every walk into a boss is an attempt, and every attempt meets the Boss
  // Gate: first try, a retry after a loss or a flight, or a boss stage reached
  // mid-visit. Stages 1-6 never ask and never mention anybody.
  const onEngage = useCallback((minionStage?: number) => {
    // A skirmish never meets the gate: it is not the boss and nobody has to be
    // waited for.
    if (minionStage !== undefined) { begin(minionStage); return; }
    if (partner && promptApplies(stage, true)) { setAsking(true); return; }
    begin();
  }, [partner, stage, begin]);

  const onGateAnswer = useCallback((result: 'party' | 'solo' | 'leave') => {
    setAsking(false);
    // Backed out: no fight. Walking the pet home clears the scene's engaged
    // latch, so walking in again asks again.
    if (result === 'leave') { scene.current?.withdraw(); return; }
    const joined = result === 'party';
    setParty(joined);
    // Decided as this attempt starts and held for it, as `onEnter` does for the gate.
    together.current = togetherBonus(stage, joined && partnerAtGate(world.gate, partner?.id, Date.now()));
    begin();
  }, [stage, world.gate, partner?.id, begin]);

  // The scene is rebuilt when the stage or the island's face changes, and at no
  // other time. `onEngage` is deliberately absent from the dependencies: it
  // closes over state that settles, and rebuilding the whole canvas when it
  // changes would tear the garden down mid-walk. The scene reads it through a
  // ref that the effect below keeps current.
  // Read when the scene is built and not before: a skirmish beaten mid-visit
  // fades in the scene and must not rebuild it, so this is a ref and not a dep.
  const beatenRef = useRef<string[]>([]);
  beatenRef.current = avatar?.minionDay === day ? avatar.minionsBeaten ?? [] : [];
  const engageRef = useRef(onEngage);
  useEffect(() => {
    engageRef.current = onEngage;
  });

  // Calm reaches the scene the same way, and for the same reason: turning it on
  // mid-fight must not tear the garden down, so it stays out of the start
  // effect's deps and is handed over live instead.
  const calmRef = useRef(calm);
  useEffect(() => {
    calmRef.current = calm;
    scene.current?.setCalm(calm);
  }, [calm]);

  const sprite = monster?.spriteKey;

  /**
   * What the scene is built from, held still while a fight is on.
   *
   * `island` and `stage` come off the couple's shared world row, which the other
   * phone may rewrite at any moment, and `dark` off a live query on the logs. A
   * scene rebuilt under a fight destroys the tween a round is awaiting. The
   * values catch up the moment the fight ends — a win changes them on purpose.
   */
  const pose = useRef({ island, stage, dark, sprite, mode });
  if (battle?.outcome !== 'Fighting') pose.current = { island, stage, dark, sprite, mode };
  const sceneIsland = pose.current.island;
  const sceneStage = pose.current.stage;
  const sceneDark = pose.current.dark;
  const sceneSprite = pose.current.sprite;
  const sceneMode = pose.current.mode;

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
    if (!sceneSprite || !companion || !host.current) return undefined;
    let live = true;

    // The floor first, and only the floor: it draws one frame and lets go of the
    // GPU before Phaser asks for it. Calm, Save-Data, and failures use the
    // selected companion's static 2D floor rather than opening WebGL.
    Promise.all([
      import('./scene/game'),
      loadArenaFloor(host.current, calmRef.current, arenaTokensForPet(companion, sceneMode)),
    ])
      .then(([{ startGarden }, floor]) => {
        if (!live || !host.current) return;
        scene.current = startGarden(
          host.current,
          {
            island: sceneIsland,
            stage: sceneStage,
            monsterSprite: sceneSprite,
            petSprite,
            allySprite: allyRef.current,
            hour: new Date().getHours(),
            dark: sceneDark,
            calm: calmRef.current,
            floor: floor ?? undefined,
            minions: minionsOnStage(sceneIsland, sceneStage, arenaFor(sceneIsland, sceneStage), beatenRef.current)
              .map((m) => ({ stage: m.stage, sprite: m.spriteKey, x: m.x, y: m.y })),
          },
          { onEngage: (minionStage) => engageRef.current(minionStage) },
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
  }, [sceneIsland, sceneStage, sceneSprite, petSprite, companion, sceneDark, sceneMode, textMode, reload]);

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
      if (document.hidden) { scene.current?.pause(); return; }
      scene.current?.resume();
      // Back from a locked phone or another app, standing on the boss: the
      // attempt starts again at the pedestals, as a fresh visit would.
      const now = resumeState.current;
      if (now.companion && backToTheGate('resumed', now.stage, now.fighting)) setRegate(true);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  /** Set when the next thing on screen should be the Raid Gate's pedestals again. */
  const [regate, setRegate] = useState(false);
  const resumeState = useRef({ companion, stage, fighting: false });
  resumeState.current = { companion, stage, fighting: battle?.outcome === 'Fighting' };
  useEffect(() => {
    if (!regate) return undefined;
    // A beat to read how the fight ended, then the gate, with this companion
    // ringed and "Not yet" to step straight back into the garden.
    const timer = window.setTimeout(() => {
      setRegate(false);
      cameFrom.current = resumeState.current.companion;
      openGate(false);
    }, battle ? REGATE_DELAY_MS : 0);
    return () => window.clearTimeout(timer);
  }, [regate, battle, openGate]);

  /* ---- a round ---- */

  /** How a hit should look: strong when today's logging is on its weakness, as C# priced it. */
  const edgeOf = useCallback(
    (foe: MonsterDto | null) => (chargeOnWeakness(charges, foe?.weakness) ? 'strong' as const : 'plain' as const),
    [charges],
  );

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

    // A skirmish: a little XP, once a day each, and nothing else. No stage is
    // cleared, no star chest is lit, and the boss gate is not involved.
    if (isMinionId(ended.monsterId)) {
      if (ended.outcome !== 'Won') { scene.current?.withdraw(); return; }
      await scene.current?.defeat();
      if (coupleId && memberId) {
        const first = await recordMinionWin(memberId, coupleId, day, ended.monsterId);
        if (first) await awardPetXp(coupleId, `garden-minion-${day}-${ended.monsterId}`, ended.xpOwed);
        setNote(first
          ? `${foe.name} is down. +${ended.xpOwed} XP, to the two of you.`
          : `${foe.name} is down. It has paid today already.`);
      }
      setSkirmish(null);
      setBattle(null);
      return;
    }

    if (ended.outcome !== 'Won') {
      scene.current?.withdraw();
      // A boss attempt that did not land goes back through the pedestals.
      if (backToTheGate(ended.outcome, stageOfMonster(ended.monsterId) ?? stage, false)) setRegate(true);
      return;
    }

    await scene.current?.defeat();
    if (!coupleId) return;

    // The award id is the monster, not the phone: both partners see the same
    // victory and both will report it, and `awardPetXp` dedups on the id — so
    // a stage pays once however many devices watched it fall.
    await awardPetXp(coupleId, `garden-stage-${ended.monsterId}`, ended.xpOwed);
    // The partner gate's share, on a boss stage only and only if the other half
    // was at the gate when this fight began. Its own id, per monster, so both
    // phones reporting the same win still pay it once.
    const bonusXp = stageOfMonster(ended.monsterId) === STAGES_PER_ISLAND
      ? togetherXp(ended.xpOwed, together.current)
      : 0;
    if (bonusXp > 0) await awardPetXp(coupleId, `garden-together-${ended.monsterId}`, bonusXp);

    // Coins are the member's own, so this one is per phone: a first clear pays
    // its coins once, and a boss already beaten drops replay loot (capped a day).
    const loot = memberId
      ? await settleGardenClear(memberId, coupleId, {
        monsterId: ended.monsterId,
        island: islandOfMonster(ended.monsterId) ?? island,
        stage: stageOfMonster(ended.monsterId) ?? stage,
        day,
        coinMultiplier: together.current.coinMultiplier,
        extraPurses: together.current.purses,
      })
      : null;
    const lootText = loot && (loot.coins > 0 || loot.purses.length > 0)
      ? `${loot.replay ? 'Loot: ' : ''}+${loot.coins} coins${loot.purses.length > 0 ? ` and ${loot.purses.length === 1 ? 'a purse' : `${loot.purses.length} purses`} in your bag` : ''}.`
      : '';
    // A semi-boss or boss leaves a free star chest on the Raid path until opened.
    const starText = starMilestone(ended.monsterId) && !(avatar?.starChests ?? []).includes(ended.monsterId)
      ? ' A star chest is waiting on the Raid path.'
      : '';
    const after = await clearStageFor(coupleId, ended.monsterId);

    const game = client.current;
    const next = game ? await game.progress(petXp + ended.xpOwed + bonusXp) : null;
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
    const petLevelAfter = levelForXp(petXp + ended.xpOwed + bonusXp);
    const crossed = petLevelAfter > petLevelBefore
      ? milestonesAt(petLevelAfter)
      : [];

    setVictory({
      monster: foe,
      xp: ended.xpOwed + bonusXp,
      leveledUp: petLevelAfter > petLevelBefore,
      level: petLevelAfter,
      rewardText: crossed.length > 0
        ? crossed.map((entry) => `${entry.name}. ${entry.blurb}`).join(' ')
        : '',
      lootText: `${lootText}${starText}`.trim(),
    });
    void after;
  }, [coupleId, memberId, petXp, companion, island, stage, day, avatar?.starChests]);

  const playRound = useCallback(async (opening: BattleDto, actionId: string) => {
    const game = client.current;
    const foe = opponent;
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
            await settle(scene.current?.skill(verdict.skill.vfx));
          }
        }
        for (const key of Object.keys(cooldowns.current)) cooldowns.current[key] += 1;

        const edge = action?.type === 'Attack' ? edgeOf(foe) : 'plain';
        if (edge === 'strong') {
          const line = mine.log.map((entry) => entry.who).lastIndexOf('Player');
          if (line >= 0) setWeakHits((seen) => [...seen, line]);
        }
        // The couple's move is a small scene of its own: your pet and the
        // partner's (or an echo of yours) hit together. Every other move is the
        // companion's lunge and spark.
        if (action?.style === 'Together') {
          await settle(scene.current?.together(edge));
        } else {
          await settle(scene.current?.strike(
            'player-hits',
            edge,
            move ? { move, kit: kit.themeId } : undefined,
          ));
        }
      }

      if (mine.outcome !== 'Fighting') {
        await finish(mine, foe);
        return;
      }
      if (mine.turn !== 'Monster') return;

      // The gap that lets two swings read as two. Calm has no swings to separate.
      const gap = strikePlan({ calm: calmRef.current }).turnGap;
      if (gap > 0) await new Promise((resolve) => setTimeout(resolve, gap));

      // The warning was computed from this same state, so it says how many
      // blows are coming: a Swarm's flurry is two, everything else one. A swing
      // that misses is left out rather than drawn as a hit.
      const blows = blowsFor(mine.telegraph);
      const theirs = await game.monsterMove(mine);
      if (!theirs) return;
      setBattle(theirs);
      if (!monsterMissed(theirs.log)) {
        for (let blow = 0; blow < blows; blow += 1) {
          await settle(scene.current?.strike('monster-hits', 'plain'));
        }
      }

      if (theirs.outcome !== 'Fighting') await finish(theirs, foe);
    } catch (error) {
      setFault(faultFrom('round', error));
    } finally {
      setBusy('idle');
    }
  }, [opponent, progress, finish, kit, charges, moveNames, edgeOf]);

  /** One tap of the move bar. A move is a move: nothing is logged by it. */
  const onAct = useCallback(async (action: ActionDto) => {
    if (busy !== 'idle') return;
    if (battle?.outcome === 'Fighting') await playRound(battle, action.id);
  }, [busy, battle, playRound]);

  /**
   * The monster's move when nothing else will play it — see `shouldRedriveMonster`.
   * A fight that opens on the monster's turn, or a round cut short, would
   * otherwise sit on "Waiting on them." with every control disabled.
   */
  const redriving = useRef(false);
  useEffect(() => {
    const game = client.current;
    const foe = opponent;
    if (redriving.current || !game || !foe || !battle || !shouldRedriveMonster(battle, busy)) return undefined;
    // Only the timer is cancelled on cleanup. Once the move is asked for, taking
    // `busy` below re-runs this effect, and a cancel there would drop the answer.
    const timer = setTimeout(() => {
      redriving.current = true;
      setBusy('acting');
      game.monsterMove(battle)
        .then(async (theirs) => {
          if (!theirs) throw new Error('the monster could not take its turn');
          setBattle(theirs);
          if (!monsterMissed(theirs.log)) {
            for (let blow = 0; blow < blowsFor(battle.telegraph); blow += 1) {
              await settle(scene.current?.strike('monster-hits', 'plain'));
            }
          }
          if (theirs.outcome !== 'Fighting') await finish(theirs, foe);
        })
        .catch((error) => setFault(faultFrom('round', error)))
        .finally(() => { redriving.current = false; setBusy('idle'); });
    }, REDRIVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [battle, busy, opponent, finish]);

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
  // react-doctor-disable-next-line no-set-state-after-await-in-effect -- both setters below are gated on `live`, which the cleanup clears; the payment itself must still finish, so the work is not cancelled
  useEffect(() => {
    const game = client.current;
    if (!game || !coupleId) return undefined;
    const awarded = new Set(pet?.awardedXpIds ?? []);
    const owed = payingActivities(charges)
      .map((activity) => ({ activity, awardId: gardenAwardId(day, activity) }))
      .filter(({ awardId }) => !paid.current.has(awardId) && !awarded.has(awardId));
    if (owed.length === 0) return undefined;

    let live = true;
    (async () => {
      let xp = petXp;
      for (const { activity, awardId } of owed) {
        paid.current.add(awardId);
        const award = await game.award(activity, xp);
        if (award.xp > 0) {
          await awardPetXp(coupleId, awardId, award.xp);
          xp += award.xp;
          if (!live) continue;
          setPulse((n) => n + 1);
        }
      }
    })().catch((error) => { if (live && !isClosed(error)) setNote('A charge did not pay out. It will try again.'); });
    return () => { live = false; };
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
        cards={cards}
        verdict={gate.verdict}
        hour={new Date().getHours()}
        dark={dark}
        resonance={resonance}
        world={world}
        partner={partner
          ? {
            name: partner.displayName?.trim() || 'Your partner',
            themeId: allyThemeId(partnerAvatar),
            dye: partnerAvatar?.dye,
          }
          : undefined}
        together={bossStage && party && partner
          ? {
            partnerName: partner.displayName?.trim() || 'your partner',
            present: partnerPresent,
            blockedReason: bossEntryBlockedBecause(stage, true, partnerPresent),
          }
          : undefined}
        onEnter={onEnter}
        onCancel={cameFrom.current ? () => onEnter(cameFrom.current as string) : undefined}
      />
    );
  }

  return (
    <section className={`page garden${dark ? ' is-dark' : ''}`}>
      <div className="garden-top">
        <InfoBubble guide={GUIDES.eveGarden} />
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
          onClick={() => { cameFrom.current = companion; openGate(true); }}
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

      {/* The log is a strip above the board and the pad sits under it, so the
          thumb never has to cross the picture. See `BattleLog`. */}
      <BattleLog battle={battle} monster={opponent} weakHits={weakHits} />
      <ActionHint battle={battle} monster={opponent} level={progress?.level ?? 1} charges={charges} />

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

      </div>

      {/* The controller: the move pad on the left, today's charges on the right,
          side by side on every width. The meter is a picture of the day, never
          a control — logging happens on the pages that own it. */}
      <div className="garden-controls" data-no-pull>
        <ActionBar
          actions={progress?.actions ?? []}
          allActions={allActions}
          battle={battle}
          monster={opponent}
          busy={busy !== 'idle'}
          kit={kit}
          charges={charges}
          stats={sheet.total}
          onAct={(action) => { void onAct(action); }}
          onFlee={onFlee}
        />
        <ChargeMeter charges={charges} weakness={opponent?.weakness} />
      </div>

      {mapOpen && (
        <WorldMap
          islands={islands}
          progress={world}
          dark={dark}
          onTravel={(to) => { void onTravel(to); }}
          onClose={() => setMapOpen(false)}
        />
      )}

      {asking && partner && (
        <BossGatePrompt
          partnerName={partner.displayName?.trim() || 'your partner'}
          present={partnerAtGate(world.gate, partner.id, Date.now())}
          coupleId={coupleId}
          memberId={memberId}
          onDone={onGateAnswer}
        />
      )}

      {victory && (
        <VictoryBanner
          monster={victory.monster}
          xp={victory.xp}
          leveledUp={victory.leveledUp}
          level={victory.level}
          rewardText={victory.rewardText}
          lootText={victory.lootText}
          islandComplete={isIslandComplete(world, island)}
          nextIslandName={nextIslandName}
          onDismiss={() => { setVictory(null); setBattle(null); }}
        >
          {/* One bonus spin per island boss, on top of the day's own. */}
          {victory.monster.type === 'Boss' && memberId && coupleId ? (
            <SpinOffer
              label="Bonus spin"
              title="Boss bonus spin"
              onSpin={() => spinBossWheel(memberId, coupleId, victory.monster.id)}
            />
          ) : null}
        </VictoryBanner>
      )}

    </section>
  );
}
