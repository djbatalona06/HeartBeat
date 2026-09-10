import type { ComponentType } from 'react';
import { PET_KINDS } from '../../../../domain/rpg/pets';
import { FieldHorse } from './FieldHorse';
import { DawnCourser } from './DawnCourser';
import { Tidewalker } from './Tidewalker';
import { CometManed } from './CometManed';
import { LanternFairy } from './LanternFairy';
import { LilyFairy } from './LilyFairy';
import { StargazerFairy } from './StargazerFairy';
import { AuroraFairy } from './AuroraFairy';
import { CandleVampire } from './CandleVampire';
import { VelvetVampire } from './VelvetVampire';
import { MoonlessVampire } from './MoonlessVampire';
import { EclipseVampire } from './EclipseVampire';
import { PaperCat } from './PaperCat';
import { RibbonCat } from './RibbonCat';
import { InkCat } from './InkCat';
import { LanternTailCat } from './LanternTailCat';

/**
 * One portrait per companion kind. Companions had no artwork at all before
 * this — they rendered as text cards with a rarity glow around nothing. Built
 * by walking `PET_KINDS` rather than declared as a flat map, for the same
 * reason `art/gear/index.ts` is: a kind with no entry here throws at import
 * time instead of quietly showing a blank card.
 */
const ART: Record<string, ComponentType> = {
  'horse-common': FieldHorse,
  'horse-rare': DawnCourser,
  'horse-epic': Tidewalker,
  'horse-godly': CometManed,
  'fairy-common': LanternFairy,
  'fairy-rare': LilyFairy,
  'fairy-epic': StargazerFairy,
  'fairy-godly': AuroraFairy,
  'vampire-common': CandleVampire,
  'vampire-rare': VelvetVampire,
  'vampire-epic': MoonlessVampire,
  'vampire-godly': EclipseVampire,
  'cat-common': PaperCat,
  'cat-rare': RibbonCat,
  'cat-epic': InkCat,
  'cat-godly': LanternTailCat,
};

for (const kind of PET_KINDS) {
  if (!ART[kind.id]) throw new Error(`pet kind "${kind.id}" has no drawing in art/pets`);
}

export function petArt(kindId: string): ComponentType | undefined {
  return ART[kindId];
}
