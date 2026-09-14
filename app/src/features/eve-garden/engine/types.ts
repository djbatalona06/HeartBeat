/**
 * The TypeScript twin of the DTOs in `game/HeartBeat.Game.Core/Dto.cs`.
 *
 * Hand-written, because the alternative — generating them — would add a code
 * generator to a repository whose whole build is `tsc` and `vite`, to keep
 * fifteen shapes in step. `ApiTests.cs` asserts the exact field names and enum
 * spellings on the C# side, so a rename there fails a test rather than
 * silently producing `undefined` here.
 *
 * Enum values are PascalCase: `PropertyNamingPolicy` camelCases property names
 * but does not reach enum members, and eight per-enum converters was more
 * machinery than a lowercase letter is worth. See the note on `GameJson`.
 */

export type Element = 'Mood' | 'Movement' | 'Nourishment' | 'Focus' | 'Rest';
export type MonsterType = 'Common' | 'SemiBoss' | 'Elite' | 'Boss';
export type ActionKind = 'Attack' | 'Debuff' | 'Heal' | 'Shield';
export type DioramaTheme = 'Light' | 'Dark';
export type StatusKind = 'SpeedDown' | 'AttackDown' | 'Drain' | 'Guard';
export type Side = 'Player' | 'Monster';
export type Outcome = 'Fighting' | 'Won' | 'Down' | 'Fled';

/** The five wellness activities that pay XP. Matches the C# `Activity` enum. */
export type Activity = 'Mood' | 'Exercise' | 'Work' | 'Rest' | 'Gratitude';

export interface ActionDto {
  id: string;
  name: string;
  power: number;
  element: Element;
  type: ActionKind;
  unlockLevel: number;
  /** Null for the couple's synergy move, which is nobody's individual log. */
  activity: Activity | null;
  /** What logging this activity is worth. Zero when there is no activity. */
  xp: number;
}

export interface MonsterDto {
  id: string;
  name: string;
  type: MonsterType;
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  weakness: Element;
  strength: Element;
  /** Looks up a 16x16 sprite in `domain/rpg/sprites.ts`. */
  spriteKey: string;
  theme: DioramaTheme;
  actionNames: string[];
  /** What beating it is worth. */
  xp: number;
}

export interface StageDto {
  number: number;
  name: string;
  monster: MonsterDto;
}

export interface IslandDto {
  number: number;
  lightName: string;
  darkName: string;
  element: Element;
  /** False for an island that is named but has no stages authored yet. */
  built: boolean;
  stageCount: number;
}

export interface WorldDto {
  islands: IslandDto[];
  stagesPerIsland: number;
}

export interface EffectDto {
  kind: StatusKind;
  magnitude: number;
  turnsLeft: number;
}

export interface CombatantDto {
  hp: number;
  maxHp: number;
  shield: number;
  attack: number;
  defense: number;
  speed: number;
  hpFraction: number;
  effects: EffectDto[];
}

export interface LineDto {
  round: number;
  who: Side;
  text: string;
}

/**
 * A whole fight.
 *
 * The C# side keeps nothing between calls, so this is handed straight back on
 * the next one. Treat it as opaque *state* — never edit a field and send it on
 * — while reading `player`, `monster` and `log` freely to draw the screen.
 * Monster stats are looked up server-side from the island and stage, so editing
 * them here changes nothing.
 */
export interface BattleDto {
  monsterId: string;
  island: number;
  stage: number;
  theme: DioramaTheme;
  level: number;
  round: number;
  turn: Side;
  player: CombatantDto;
  monster: CombatantDto;
  log: LineDto[];
  outcome: Outcome;
  seed: number;
  /** XP banked by this fight, for `repository/petXp` to pay once it is won. */
  xpOwed: number;
  /** Plain hits left, for the "is this going anywhere" read. Zero once over. */
  hitsLeft: number;
}

export interface ProgressDto {
  xp: number;
  level: number;
  xpIntoLevel: number;
  /** Zero at max level, where there is no next one. */
  xpForNextLevel: number;
  progress: number;
  atMaxLevel: boolean;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  actions: ActionDto[];
}

export interface AwardDto {
  xp: number;
  totalXp: number;
  level: number;
  leveledUp: boolean;
  /** Empty unless a level was crossed. */
  rewardText: string;
  progress: ProgressDto;
}
