import type { CSSProperties } from 'react';
import { getMascot } from '../../pet/mascots';
import { dyeStyle } from '../../../domain/rpg/dyes';

/**
 * The partner's companion, on its own small pedestal at the edge of the gate.
 *
 * A figure, not a control and not a message: it shows who walks in beside you
 * on every stage, and it says nothing about waiting -- stages 1-6 are
 * asynchronous, and only the boss stage's `TogetherTether` speaks to whether
 * they are here. Their pick, else their mascot, else the default bird, so the
 * pedestal is never empty while their row is still on its way.
 */
export interface GatePartnerProps {
  name: string;
  /** `allyThemeId(partnerAvatar)`; undefined draws the default. */
  themeId: string | undefined;
  dye?: string;
}

export function GatePartner({ name, themeId, dye }: GatePartnerProps) {
  const mascot = getMascot(themeId ?? '');
  return (
    <figure className="raid-gate-partner" aria-label={`${name} walks with ${mascot.name}`}>
      <span className="raid-gate-partner-figure" style={dyeStyle(dye) as CSSProperties}>
        <mascot.Art mood="content" />
      </span>
      <span className="raid-gate-plinth" aria-hidden="true" />
      <figcaption className="raid-gate-partner-name">{name}</figcaption>
    </figure>
  );
}
