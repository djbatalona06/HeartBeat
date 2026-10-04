import type { ComponentType } from 'react';
import { GEAR } from '../../../../domain/rpg/gear';
import { BorrowedHoodie } from './BorrowedHoodie';
import { LilyShawl } from './LilyShawl';
import { TidewalkerCoat } from './TidewalkerCoat';
import { Hearthweave } from './Hearthweave';
import { OddSocks } from './OddSocks';
import { PuddleJumpers } from './PuddleJumpers';
import { Longstride } from './Longstride';
import { SundayMorning } from './SundayMorning';
import { TicketStub } from './TicketStub';
import { PressedLily } from './PressedLily';
import { NorthStar } from './NorthStar';
import { Heartbeat } from './Heartbeat';
import { WoodenSpoon } from './WoodenSpoon';
import { EmberBrand } from './EmberBrand';
import { CometLance } from './CometLance';
import { SecondWind } from './SecondWind';
import { TheGoodBlanket } from './TheGoodBlanket';
import { TheDriveHome } from './TheDriveHome';
import { SpareKey } from './SpareKey';
import { PlainSentence } from './PlainSentence';
import {
  AuroraVeil, FirstSnow, PaperCrown, PorchLight, RainHood, RedRibbon, StargazerCirclet, Streetlamp,
} from './head';
import {
  BrassCompass, Cardigan, CoastalPath, GardenClogs, GardenShears, HarbourJacket,
  KindReply, LighthouseBeam, Mixtape, NightBus, Polaroid, WoodsmokeCoat,
} from './more';

/**
 * One drawing per catalogue item — see `art/pets/index.ts` for the sibling
 * registry and the same reasoning. Built by walking `GEAR` rather than
 * declared as a flat map, so `tsc` never lets an item ship art-less: an id in
 * the catalogue with no entry here throws at import time instead of quietly
 * rendering a gap in the shop grid.
 */
const ART: Record<string, ComponentType> = {
  'head-paper-crown': PaperCrown,
  'head-ribbon': RedRibbon,
  'head-stargazer-circlet': StargazerCirclet,
  'head-aurora-veil': AuroraVeil,
  'body-borrowed-hoodie': BorrowedHoodie,
  'body-lily-shawl': LilyShawl,
  'body-tidewalker-coat': TidewalkerCoat,
  'body-hearthweave': Hearthweave,
  'boots-odd-socks': OddSocks,
  'boots-puddle-jumpers': PuddleJumpers,
  'boots-longstride': Longstride,
  'boots-sunday-morning': SundayMorning,
  'charm-ticket-stub': TicketStub,
  'charm-pressed-lily': PressedLily,
  'charm-north-star': NorthStar,
  'charm-heartbeat': Heartbeat,
  'weapon-wooden-spoon': WoodenSpoon,
  'weapon-ember-brand': EmberBrand,
  'weapon-comet-lance': CometLance,
  'weapon-second-wind': SecondWind,
  'head-porch-light': PorchLight,
  'body-the-good-blanket': TheGoodBlanket,
  'boots-the-drive-home': TheDriveHome,
  'charm-spare-key': SpareKey,
  'weapon-plain-sentence': PlainSentence,
  'head-rain-hood': RainHood,
  'head-streetlamp': Streetlamp,
  'head-first-snow': FirstSnow,
  'weapon-garden-shears': GardenShears,
  'weapon-lighthouse-beam': LighthouseBeam,
  'weapon-kind-reply': KindReply,
  'body-cardigan': Cardigan,
  'body-harbour-jacket': HarbourJacket,
  'body-woodsmoke-coat': WoodsmokeCoat,
  'boots-garden-clogs': GardenClogs,
  'boots-night-bus': NightBus,
  'boots-coastal-path': CoastalPath,
  'charm-mixtape': Mixtape,
  'charm-brass-compass': BrassCompass,
  'charm-polaroid': Polaroid,
};

for (const item of GEAR) {
  if (!ART[item.id]) throw new Error(`gear item "${item.id}" has no drawing in art/gear`);
}

export function gearArt(itemId: string): ComponentType | undefined {
  return ART[itemId];
}
