import { useEffect, useState } from 'react';
import { stampGatePresence } from '../../../db/repository';
import { PRESENCE_REFRESH_MS } from '../../../domain/rpg/raidGate';
import { nextPrompt, togetherRewardLines, type PromptAction, type PromptStep } from '../../../domain/rpg/gatePrompt';
import { PrimaryAction } from '../../../ui/PrimaryAction';
import { SecondaryAction } from '../../../ui/SecondaryAction';
import { Sheet } from '../../../ui/Sheet';

/**
 * The Boss Gate: the party-mode question, asked every time the pet walks into
 * a boss.
 *
 * It used to be a route guard that asked once, on the way into the garden, and
 * then stayed quiet for the visit -- so a retry after a loss, or a boss stage
 * reached mid-visit, went in without being asked. It now lives inside Eve's
 * Garden and opens on every attempt, like the Raid Gate opens on every mount:
 * a ritual that starts fresh, never a remembered answer. Declining takes two
 * taps (`domain/rpg/gatePrompt.ts`), and Escape or the scrim never complete it.
 *
 * While it is up this phone stamps its presence at the gate, which is what lets
 * two phones on the popup see each other through sync.
 */
export interface BossGatePromptProps {
  partnerName: string;
  /** The partner stamped the gate recently. */
  present: boolean;
  coupleId?: string;
  memberId?: string;
  /** `leave` is a dismissal from the first step: no fight, nothing chosen. */
  onDone(result: 'party' | 'solo' | 'leave'): void;
}

export function BossGatePrompt({ partnerName, present, coupleId, memberId, onDone }: BossGatePromptProps) {
  const [step, setStep] = useState<PromptStep>('ask');

  useEffect(() => {
    if (!coupleId || !memberId) return undefined;
    const stamp = () => { void stampGatePresence(coupleId, memberId).catch(() => {}); };
    stamp();
    const timer = setInterval(stamp, PRESENCE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [coupleId, memberId]);

  const act = (action: PromptAction) => {
    const result = nextPrompt(step, action);
    if (result.done) onDone(result.done);
    else setStep(result.step);
  };

  return (
    <Sheet
      open
      onClose={() => act('dismiss')}
      label="Boss Gate"
      scrimClassName="popup-scrim"
      panelClassName="popup-panel boss-gate-prompt"
    >
      {step === 'ask' ? (
        <>
          <h2 className="section-title">
            {present ? `${partnerName} is at the Boss Gate` : 'The Boss Gate'}
          </h2>
          <p className="section-sub">
            {present
              ? 'Go in together, in party mode, and the boss pays out more.'
              : `The boss pays out more when ${partnerName} is here too. Join party mode and wait at the gate for them.`}
          </p>
          <ul className="boss-gate-rewards">
            {togetherRewardLines().map((line) => <li key={line}>{line}</li>)}
          </ul>
          <div className="popup-actions">
            <PrimaryAction onClick={() => act('join')}>Join party mode</PrimaryAction>
            <SecondaryAction onClick={() => act('decline')}>Not now</SecondaryAction>
          </div>
        </>
      ) : (
        <>
          <h2 className="section-title">Go in without {partnerName}?</h2>
          <p className="section-sub">
            The fight is the same. Going in alone gives up what party mode adds:
          </p>
          <ul className="boss-gate-rewards">
            {togetherRewardLines().map((line) => <li key={line}>{line}</li>)}
          </ul>
          <div className="popup-actions">
            <PrimaryAction onClick={() => act('back')}>Go back</PrimaryAction>
            <SecondaryAction onClick={() => act('solo')}>Go in solo</SecondaryAction>
          </div>
        </>
      )}
    </Sheet>
  );
}
