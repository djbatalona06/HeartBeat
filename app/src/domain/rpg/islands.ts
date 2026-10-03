import type { Element, MonsterType } from '../../features/eve-garden/engine/types';

/**
 * The ten islands, as the Raid Gate draws them.
 *
 * A mirror of `game/HeartBeat.Game.Core/Data/Island<N>.cs` — names, faces and
 * the few numbers the gate shows — and deliberately no more than that. The
 * gate stands in front of Eve's Garden precisely so that the 3.5 MB
 * WebAssembly runtime does not boot for a screen somebody backs out of, so the
 * gate cannot ask C# who the boss is. It reads this instead, and
 * `islands.test.ts` parses the C# so a stat or a name changed there fails a
 * test here. Everything the *fight* uses still comes from C#.
 */

export interface StageView {
  number: number;
  /** What the compass calls the stage. */
  name: string;
  monsterId: string;
  monster: string;
  /** The same monster on the island's dark face. */
  darkMonster: string;
  type: MonsterType;
  /** Light-face HP. The dark face is `Monster.DarkScale` heavier. */
  hp: number;
  weakness: Element;
  strength: Element;
  spriteKey: string;
}

export interface IslandView {
  number: number;
  lightName: string;
  darkName: string;
  element: Element;
  stages: readonly StageView[];
}

/** Mirrors `Monster.DarkScale`. */
export const DARK_SCALE = 1.25;

export const ISLANDS: readonly IslandView[] = [
  {
    number: 1,
    lightName: 'Morning Meadow',
    darkName: 'Sloth Bog',
    element: 'Movement',
    stages: [
      { number: 1, name: 'The First Step', monsterId: 'i1s1-sloth-sprout', monster: 'Mossling', darkMonster: 'Bog Mossling', type: 'Common', hp: 30, weakness: 'Movement', strength: 'Rest', spriteKey: 'sloth-sprout' },
      { number: 2, name: 'Dew Line', monsterId: 'i1s2-dozing-beetle', monster: 'Dewdrop Sprite', darkMonster: 'Murk Dewdrop', type: 'Common', hp: 42, weakness: 'Movement', strength: 'Rest', spriteKey: 'dozing-beetle' },
      { number: 3, name: 'The Long Grass', monsterId: 'i1s3-snooze-thistle', monster: 'Cinder Sprite', darkMonster: 'Smoulder Sprite', type: 'Common', hp: 55, weakness: 'Movement', strength: 'Focus', spriteKey: 'snooze-thistle' },
      { number: 4, name: 'The Long Lie-In', monsterId: 'i1s4-lie-in', monster: 'The Long Drizzle', darkMonster: 'The Endless Drizzle', type: 'SemiBoss', hp: 90, weakness: 'Movement', strength: 'Rest', spriteKey: 'lie-in' },
      { number: 5, name: 'Open Ground', monsterId: 'i1s5-dust-drifter', monster: 'Breeze Wisp', darkMonster: 'Fog Wisp', type: 'Common', hp: 48, weakness: 'Movement', strength: 'Mood', spriteKey: 'dust-drifter' },
      { number: 6, name: 'The Old Couch', monsterId: 'i1s6-couch-moss', monster: 'Mossback Golem', darkMonster: 'Sunken Mossback', type: 'Elite', hp: 120, weakness: 'Movement', strength: 'Rest', spriteKey: 'couch-moss' },
      { number: 7, name: "The Sentinel's Field", monsterId: 'i1s7-sedentary-sentinel', monster: 'The Hearthkeeper', darkMonster: 'The Ashen Hearthkeeper', type: 'Boss', hp: 200, weakness: 'Movement', strength: 'Mood', spriteKey: 'sedentary-sentinel' },
    ],
  },
  {
    number: 2,
    lightName: 'Kitchen Grove',
    darkName: 'Craving Cavern',
    element: 'Nourishment',
    stages: [
      { number: 1, name: 'The Orchard Gate', monsterId: 'i2s1-pipkin', monster: 'Pipkin', darkMonster: 'Hollow Pipkin', type: 'Common', hp: 98, weakness: 'Nourishment', strength: 'Rest', spriteKey: 'pipkin' },
      { number: 2, name: 'Honey Row', monsterId: 'i2s2-buzzbun', monster: 'Buzzbun', darkMonster: 'Sticky Buzzbun', type: 'Common', hp: 137, weakness: 'Nourishment', strength: 'Focus', spriteKey: 'buzzbun' },
      { number: 3, name: 'The Spice Rack', monsterId: 'i2s3-pepperwisp', monster: 'Pepperwisp', darkMonster: 'Scorch Pepperwisp', type: 'Common', hp: 208, weakness: 'Nourishment', strength: 'Mood', spriteKey: 'pepperwisp' },
      { number: 4, name: 'The Long Table', monsterId: 'i2s4-auntie-crumble', monster: 'Auntie Crumble', darkMonster: 'The Stale Crumble', type: 'SemiBoss', hp: 228, weakness: 'Nourishment', strength: 'Movement', spriteKey: 'auntie-crumble' },
      { number: 5, name: 'Melon Patch', monsterId: 'i2s5-rindroll', monster: 'Rindroll', darkMonster: 'Overripe Rindroll', type: 'Common', hp: 121, weakness: 'Nourishment', strength: 'Rest', spriteKey: 'rindroll' },
      { number: 6, name: 'The Cold Pantry', monsterId: 'i2s6-frostcrate', monster: 'Frostcrate Golem', darkMonster: 'Freezer-Burnt Frostcrate', type: 'Elite', hp: 334, weakness: 'Nourishment', strength: 'Focus', spriteKey: 'frostcrate' },
      { number: 7, name: 'The Great Oven', monsterId: 'i2s7-mother-marzipan', monster: 'Mother Marzipan', darkMonster: 'The Hollow Marzipan', type: 'Boss', hp: 517, weakness: 'Nourishment', strength: 'Mood', spriteKey: 'mother-marzipan' },
    ],
  },
  {
    number: 3,
    lightName: 'Focus Falls',
    darkName: 'Fog Marsh',
    element: 'Focus',
    stages: [
      { number: 1, name: 'The Spray Line', monsterId: 'i3s1-driplet', monster: 'Driplet', darkMonster: 'Murk Driplet', type: 'Common', hp: 112, weakness: 'Focus', strength: 'Rest', spriteKey: 'driplet' },
      { number: 2, name: 'Stepping Stones', monsterId: 'i3s2-pebblenook', monster: 'Pebblenook', darkMonster: 'Mossy Pebblenook', type: 'Common', hp: 170, weakness: 'Focus', strength: 'Mood', spriteKey: 'pebblenook' },
      { number: 3, name: 'The Whirlpool', monsterId: 'i3s3-eddywhirl', monster: 'Eddywhirl', darkMonster: 'Fog Eddy', type: 'Common', hp: 243, weakness: 'Focus', strength: 'Movement', spriteKey: 'eddywhirl' },
      { number: 4, name: 'The Chattering Rapids', monsterId: 'i3s4-pingwing', monster: 'Pingwing', darkMonster: 'The Endless Pingwing', type: 'SemiBoss', hp: 296, weakness: 'Focus', strength: 'Mood', spriteKey: 'pingwing' },
      { number: 5, name: 'Quiet Pool', monsterId: 'i3s5-lilypad-imp', monster: 'Lilypad Imp', darkMonster: 'Sunken Lilypad', type: 'Common', hp: 174, weakness: 'Focus', strength: 'Rest', spriteKey: 'lilypad-imp' },
      { number: 6, name: 'The Mill Wheel', monsterId: 'i3s6-gristmill', monster: 'Gristmill Golem', darkMonster: 'Rusted Gristmill', type: 'Elite', hp: 479, weakness: 'Focus', strength: 'Nourishment', spriteKey: 'gristmill' },
      { number: 7, name: 'The Top of the Falls', monsterId: 'i3s7-cascade-warden', monster: 'The Cascade Warden', darkMonster: 'The Fogbound Warden', type: 'Boss', hp: 705, weakness: 'Focus', strength: 'Rest', spriteKey: 'cascade-warden' },
    ],
  },
  {
    number: 4,
    lightName: 'Joy Ridge',
    darkName: 'Isolation Peak',
    element: 'Mood',
    stages: [
      { number: 1, name: 'Wildflower Path', monsterId: 'i4s1-chirplet', monster: 'Chirplet', darkMonster: 'Hushed Chirplet', type: 'Common', hp: 167, weakness: 'Mood', strength: 'Focus', spriteKey: 'chirplet' },
      { number: 2, name: 'Kite Hill', monsterId: 'i4s2-kitetail', monster: 'Kitetail', darkMonster: 'Tangled Kitetail', type: 'Common', hp: 256, weakness: 'Mood', strength: 'Movement', spriteKey: 'kitetail' },
      { number: 3, name: 'Sunny Ledge', monsterId: 'i4s3-glimmerbug', monster: 'Glimmerbug', darkMonster: 'Dim Glimmerbug', type: 'Common', hp: 367, weakness: 'Mood', strength: 'Rest', spriteKey: 'glimmerbug' },
      { number: 4, name: 'The Echo Cave', monsterId: 'i4s4-the-echo', monster: 'The Echo', darkMonster: 'The Lonely Echo', type: 'SemiBoss', hp: 441, weakness: 'Mood', strength: 'Focus', spriteKey: 'the-echo' },
      { number: 5, name: 'Meadow Crest', monsterId: 'i4s5-puffball', monster: 'Puffball', darkMonster: 'Gray Puffball', type: 'Common', hp: 259, weakness: 'Mood', strength: 'Nourishment', spriteKey: 'puffball' },
      { number: 6, name: 'The Stone Circle', monsterId: 'i4s6-cairn-keeper', monster: 'Cairn Keeper', darkMonster: 'Toppled Cairn', type: 'Elite', hp: 715, weakness: 'Mood', strength: 'Rest', spriteKey: 'cairn-keeper' },
      { number: 7, name: 'The Summit Bonfire', monsterId: 'i4s7-merriweather', monster: 'Mother Merriweather', darkMonster: 'The Silent Merriweather', type: 'Boss', hp: 1129, weakness: 'Mood', strength: 'Movement', spriteKey: 'merriweather' },
    ],
  },
  {
    number: 5,
    lightName: 'Rest Haven',
    darkName: 'Burnout Abyss',
    element: 'Rest',
    stages: [
      { number: 1, name: 'Lantern Lane', monsterId: 'i5s1-glowmoth', monster: 'Glowmoth', darkMonster: 'Frayed Glowmoth', type: 'Common', hp: 230, weakness: 'Rest', strength: 'Focus', spriteKey: 'glowmoth' },
      { number: 2, name: 'The Hammock Grove', monsterId: 'i5s2-shellsnooze', monster: 'Shellsnooze', darkMonster: 'Restless Shellsnooze', type: 'Common', hp: 355, weakness: 'Rest', strength: 'Movement', spriteKey: 'shellsnooze' },
      { number: 3, name: 'The Tea Garden', monsterId: 'i5s3-steepling', monster: 'Steepling', darkMonster: 'Overbrewed Steepling', type: 'Common', hp: 512, weakness: 'Rest', strength: 'Mood', spriteKey: 'steepling' },
      { number: 4, name: 'The Clock Tower', monsterId: 'i5s4-midnight-clock', monster: 'The Midnight Clock', darkMonster: 'The Burnt Midnight Clock', type: 'SemiBoss', hp: 619, weakness: 'Rest', strength: 'Focus', spriteKey: 'midnight-clock' },
      { number: 5, name: 'Pillow Fields', monsterId: 'i5s5-fluffkin', monster: 'Fluffkin', darkMonster: 'Flattened Fluffkin', type: 'Common', hp: 364, weakness: 'Rest', strength: 'Nourishment', spriteKey: 'fluffkin' },
      { number: 6, name: 'The Workshop', monsterId: 'i5s6-anvil-golem', monster: 'Anvil Golem', darkMonster: 'Overheated Anvil', type: 'Elite', hp: 1003, weakness: 'Rest', strength: 'Mood', spriteKey: 'anvil-golem' },
      { number: 7, name: 'The Dreamwell', monsterId: 'i5s7-lady-lullaby', monster: 'Lady Lullaby', darkMonster: 'The Wakeful Lullaby', type: 'Boss', hp: 1573, weakness: 'Rest', strength: 'Movement', spriteKey: 'lady-lullaby' },
    ],
  },
  {
    number: 6,
    lightName: 'Tandem Tides',
    darkName: 'Drifting Shoals',
    element: 'Bond',
    stages: [
      { number: 1, name: 'The Twin Shells', monsterId: 'i6s1-clamlet', monster: 'Clamlet', darkMonster: 'Shut Clamlet', type: 'Common', hp: 345, weakness: 'Bond', strength: 'Rest', spriteKey: 'clamlet' },
      { number: 2, name: 'Tidepool Steps', monsterId: 'i6s2-starfin', monster: 'Starfin', darkMonster: 'Stranded Starfin', type: 'Common', hp: 533, weakness: 'Bond', strength: 'Focus', spriteKey: 'starfin' },
      { number: 3, name: 'The Kelp Maze', monsterId: 'i6s3-kelpkin', monster: 'Kelpkin', darkMonster: 'Tangled Kelpkin', type: 'Common', hp: 764, weakness: 'Bond', strength: 'Movement', spriteKey: 'kelpkin' },
      { number: 4, name: 'The Lighthouse', monsterId: 'i6s4-lamp-keeper', monster: 'The Lamp Keeper', darkMonster: 'The Dark Lamp Keeper', type: 'SemiBoss', hp: 917, weakness: 'Bond', strength: 'Mood', spriteKey: 'lamp-keeper' },
      { number: 5, name: 'The Sandbar', monsterId: 'i6s5-crablet', monster: 'Crablet', darkMonster: 'Sideways Crablet', type: 'Common', hp: 538, weakness: 'Bond', strength: 'Nourishment', spriteKey: 'crablet' },
      { number: 6, name: 'The Wreck', monsterId: 'i6s6-barnacle-golem', monster: 'Barnacle Golem', darkMonster: 'Sunken Barnacle', type: 'Elite', hp: 1478, weakness: 'Bond', strength: 'Rest', spriteKey: 'barnacle-golem' },
      { number: 7, name: 'The Tide Between', monsterId: 'i6s7-queen-coralie', monster: 'Queen Coralie', darkMonster: 'The Drifting Coralie', type: 'Boss', hp: 2339, weakness: 'Bond', strength: 'Focus', spriteKey: 'queen-coralie' },
    ],
  },
  {
    number: 7,
    lightName: 'Heartwood Summit',
    darkName: 'The Hollow Crown',
    element: 'Balance',
    stages: [
      { number: 1, name: 'The Root Stair', monsterId: 'i7s1-rootling', monster: 'Rootling', darkMonster: 'Withered Rootling', type: 'Common', hp: 509, weakness: 'Balance', strength: 'Mood', spriteKey: 'rootling' },
      { number: 2, name: 'Lantern Canopy', monsterId: 'i7s2-acornet', monster: 'Acornet', darkMonster: 'Hollow Acornet', type: 'Common', hp: 790, weakness: 'Balance', strength: 'Rest', spriteKey: 'acornet' },
      { number: 3, name: 'The Sap Spring', monsterId: 'i7s3-sapsprite', monster: 'Sapsprite', darkMonster: 'Sour Sapsprite', type: 'Common', hp: 1137, weakness: 'Balance', strength: 'Focus', spriteKey: 'sapsprite' },
      { number: 4, name: 'The Split Oak', monsterId: 'i7s4-twin-oak', monster: 'The Twin Oak', darkMonster: 'The Riven Oak', type: 'SemiBoss', hp: 1364, weakness: 'Balance', strength: 'Movement', spriteKey: 'twin-oak' },
      { number: 5, name: 'Leaf Loft', monsterId: 'i7s5-leaflit', monster: 'Leaflit', darkMonster: 'Brittle Leaflit', type: 'Common', hp: 797, weakness: 'Balance', strength: 'Nourishment', spriteKey: 'leaflit' },
      { number: 6, name: 'The Ring Hall', monsterId: 'i7s6-heartwood-golem', monster: 'Heartwood Golem', darkMonster: 'Hollow Heartwood', type: 'Elite', hp: 2196, weakness: 'Balance', strength: 'Rest', spriteKey: 'heartwood-golem' },
      { number: 7, name: 'The Crown of the Tree', monsterId: 'i7s7-heartwood-crown', monster: 'The Heartwood Crown', darkMonster: 'The Hollow King', type: 'Boss', hp: 3452, weakness: 'Balance', strength: 'Bond', spriteKey: 'heartwood-crown' },
    ],
  },
  {
    number: 8,
    lightName: 'Skyward Ridge',
    darkName: 'Drift Mire',
    element: 'Mood',
    stages: [
      { number: 1, name: 'High Wildflower Path', monsterId: 'i8s1-chirplet', monster: 'Elder Chirplet', darkMonster: 'Elder Hushed Chirplet', type: 'Common', hp: 776, weakness: 'Mood', strength: 'Focus', spriteKey: 'chirplet-elder' },
      { number: 2, name: 'High Kite Hill', monsterId: 'i8s2-kitetail', monster: 'Elder Kitetail', darkMonster: 'Elder Tangled Kitetail', type: 'Common', hp: 1190, weakness: 'Mood', strength: 'Movement', spriteKey: 'kitetail-elder' },
      { number: 3, name: 'High Sunny Ledge', monsterId: 'i8s3-glimmerbug', monster: 'Elder Glimmerbug', darkMonster: 'Elder Dim Glimmerbug', type: 'Common', hp: 1726, weakness: 'Mood', strength: 'Rest', spriteKey: 'glimmerbug-elder' },
      { number: 4, name: 'The High Echo Cave', monsterId: 'i8s4-the-echo', monster: 'The Elder Echo', darkMonster: 'The Elder Lonely Echo', type: 'SemiBoss', hp: 2054, weakness: 'Mood', strength: 'Focus', spriteKey: 'the-echo-elder' },
      { number: 5, name: 'High Meadow Crest', monsterId: 'i8s5-puffball', monster: 'Elder Puffball', darkMonster: 'Elder Gray Puffball', type: 'Common', hp: 1209, weakness: 'Mood', strength: 'Nourishment', spriteKey: 'puffball-elder' },
      { number: 6, name: 'The High Stone Circle', monsterId: 'i8s6-cairn-keeper', monster: 'Elder Cairn Keeper', darkMonster: 'Elder Toppled Cairn', type: 'Elite', hp: 3303, weakness: 'Mood', strength: 'Rest', spriteKey: 'cairn-keeper-elder' },
      { number: 7, name: 'The High Summit Bonfire', monsterId: 'i8s7-merriweather', monster: 'Elder Mother Merriweather', darkMonster: 'The Elder Silent Merriweather', type: 'Boss', hp: 5214, weakness: 'Mood', strength: 'Movement', spriteKey: 'merriweather-elder' },
    ],
  },
  {
    number: 9,
    lightName: 'Harvest Terrace',
    darkName: 'Famine Hollow',
    element: 'Nourishment',
    stages: [
      { number: 1, name: 'The Deep Orchard Gate', monsterId: 'i9s1-pipkin', monster: 'Elder Pipkin', darkMonster: 'Elder Hollow Pipkin', type: 'Common', hp: 1143, weakness: 'Nourishment', strength: 'Rest', spriteKey: 'pipkin-elder' },
      { number: 2, name: 'Deep Honey Row', monsterId: 'i9s2-buzzbun', monster: 'Elder Buzzbun', darkMonster: 'Elder Sticky Buzzbun', type: 'Common', hp: 1758, weakness: 'Nourishment', strength: 'Focus', spriteKey: 'buzzbun-elder' },
      { number: 3, name: 'The Deep Spice Rack', monsterId: 'i9s3-pepperwisp', monster: 'Elder Pepperwisp', darkMonster: 'Elder Scorch Pepperwisp', type: 'Common', hp: 2516, weakness: 'Nourishment', strength: 'Mood', spriteKey: 'pepperwisp-elder' },
      { number: 4, name: 'The Deep Long Table', monsterId: 'i9s4-auntie-crumble', monster: 'Elder Auntie Crumble', darkMonster: 'The Elder Stale Crumble', type: 'SemiBoss', hp: 3029, weakness: 'Nourishment', strength: 'Movement', spriteKey: 'auntie-crumble-elder' },
      { number: 5, name: 'Deep Melon Patch', monsterId: 'i9s5-rindroll', monster: 'Elder Rindroll', darkMonster: 'Elder Overripe Rindroll', type: 'Common', hp: 1769, weakness: 'Nourishment', strength: 'Rest', spriteKey: 'rindroll-elder' },
      { number: 6, name: 'The Deep Cold Pantry', monsterId: 'i9s6-frostcrate', monster: 'Elder Frostcrate Golem', darkMonster: 'Elder Freezer-Burnt Frostcrate', type: 'Elite', hp: 4908, weakness: 'Nourishment', strength: 'Focus', spriteKey: 'frostcrate-elder' },
      { number: 7, name: 'The Deep Great Oven', monsterId: 'i9s7-mother-marzipan', monster: 'Elder Mother Marzipan', darkMonster: 'The Elder Hollow Marzipan', type: 'Boss', hp: 7693, weakness: 'Nourishment', strength: 'Mood', spriteKey: 'mother-marzipan-elder' },
    ],
  },
  {
    number: 10,
    lightName: 'Zenith Falls',
    darkName: 'Fogbound Falls',
    element: 'Focus',
    stages: [
      { number: 1, name: 'The Far Spray Line', monsterId: 'i10s1-driplet', monster: 'Elder Driplet', darkMonster: 'Elder Murk Driplet', type: 'Common', hp: 1637, weakness: 'Focus', strength: 'Rest', spriteKey: 'driplet-elder' },
      { number: 2, name: 'Far Stepping Stones', monsterId: 'i10s2-pebblenook', monster: 'Elder Pebblenook', darkMonster: 'Elder Mossy Pebblenook', type: 'Common', hp: 2498, weakness: 'Focus', strength: 'Mood', spriteKey: 'pebblenook-elder' },
      { number: 3, name: 'The Far Whirlpool', monsterId: 'i10s3-eddywhirl', monster: 'Elder Eddywhirl', darkMonster: 'Elder Fog Eddy', type: 'Common', hp: 3616, weakness: 'Focus', strength: 'Movement', spriteKey: 'eddywhirl-elder' },
      { number: 4, name: 'The Far Chattering Rapids', monsterId: 'i10s4-pingwing', monster: 'Elder Pingwing', darkMonster: 'The Elder Endless Pingwing', type: 'SemiBoss', hp: 4324, weakness: 'Focus', strength: 'Mood', spriteKey: 'pingwing-elder' },
      { number: 5, name: 'Far Quiet Pool', monsterId: 'i10s5-lilypad-imp', monster: 'Elder Lilypad Imp', darkMonster: 'Elder Sunken Lilypad', type: 'Common', hp: 2526, weakness: 'Focus', strength: 'Rest', spriteKey: 'lilypad-imp-elder' },
      { number: 6, name: 'The Far Mill Wheel', monsterId: 'i10s6-gristmill', monster: 'Elder Gristmill Golem', darkMonster: 'Elder Rusted Gristmill', type: 'Elite', hp: 6974, weakness: 'Focus', strength: 'Nourishment', spriteKey: 'gristmill-elder' },
      { number: 7, name: 'The Far Top of the Falls', monsterId: 'i10s7-cascade-warden', monster: 'The Elder Cascade Warden', darkMonster: 'The Elder Fogbound Warden', type: 'Boss', hp: 10384, weakness: 'Focus', strength: 'Rest', spriteKey: 'cascade-warden-elder' },
    ],
  },
];

export function islandView(number: number): IslandView {
  return ISLANDS.find((island) => island.number === number) ?? ISLANDS[0];
}

/** The monster on a stage, wearing the right face. */
export function stageView(island: number, stage: number): StageView | undefined {
  return islandView(island).stages.find((s) => s.number === stage);
}

/** The island's boss: the last stage, always. */
export function bossOf(island: number): StageView {
  const stages = islandView(island).stages;
  return stages[stages.length - 1];
}

/** A monster's name and HP on the face that is showing. */
export function faceOf(stage: StageView, dark: boolean): { name: string; hp: number } {
  return dark
    ? { name: stage.darkMonster, hp: Math.round(stage.hp * DARK_SCALE) }
    : { name: stage.monster, hp: stage.hp };
}
