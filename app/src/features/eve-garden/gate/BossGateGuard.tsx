import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, loadSettings } from '../../../db/database';
import { loadWorldProgress, stampGatePresence } from '../../../db/repository';
import { currentStage } from '../../../domain/rpg/world';
import { PRESENCE_REFRESH_MS, partnerAtGate } from '../../../domain/rpg/raidGate';
import {
  guardView, nextPrompt, togetherRewardLines, type PromptAction, type PromptStep,
} from '../../../domain/rpg/gatePrompt';
import { partnerOf } from '../../pairing/namingGate';
import { PrimaryAction } from '../../../ui/PrimaryAction';
import { SecondaryAction } from '../../../ui/SecondaryAction';
import { Sheet } from '../../../ui/Sheet';

/**
 * The front door of the Boss Gate.
 *
 * Wraps the `/eve-garden` route so that every way in -- the menu, the Home card,
 * the Raid page, a deep link -- passes the same question, and so that the
 * garden itself stays unmounted until it is answered: Phaser and the 3.5 MB
 * WebAssembly runtime never boot for a prompt somebody backs out of, the same
 * argument the Raid Gate makes for rendering instead of overlaying.
 *
 * It only asks on a boss stage with a partner (`promptApplies`). Stages 1 to 6
 * are asynchronous and must not mention anybody, so for those it renders its
 * children at once. Declining party mode takes two taps -- the rule lives in
 * `domain/rpg/gatePrompt.ts` -- and Escape or the scrim never complete it.
 *
 * The question is asked on the way in and never again for the same visit:
 * once the garden has been shown it stays (`guardView`), so a stage that turns
 * into the boss stage mid-visit cannot unmount a fight that was just won.
 *
 * While the popup is up this phone says it is standing at the gate
 * (`stampGatePresence`), which is what lets two phones on the popup see each
 * other through sync rather than each waiting on the other to go first.
 *
 * It asks on every visit, deliberately: like the Raid Gate behind it, the gate
 * is a ritual that opens fresh each time, and a remembered "solo" would quietly
 * outlive the evening it was said on.
 */

export interface BossGateGuardProps {
  /** Rendered once the question is answered; `party` is false only after a solo choice. */
  children: (party: boolean) => ReactNode;
}

export function BossGateGuard({ children }: BossGateGuardProps) {
  const navigate = useNavigate();
  const settings = useLiveQuery(loadSettings, []);
  const memberId = settings?.memberId;
  const coupleId = settings?.coupleId;

  const members = useLiveQuery(
    async () => (coupleId ? db.members.where('coupleId').equals(coupleId).toArray() : []),
    [coupleId],
  );
  // Tagged with the couple it was read for: a live query keeps its last answer
  // while its key changes, and an untagged first read would pass for this
  // couple's world and skip the question.
  const worldRead = useLiveQuery(
    async () => (coupleId ? { for: coupleId, world: await loadWorldProgress(coupleId) } : undefined),
    [coupleId],
  );

  const [step, setStep] = useState<PromptStep>('ask');
  const [mode, setMode] = useState<'party' | 'solo' | null>(null);
  const [opened, setOpened] = useState<boolean | null>(null);

  const partner = members ? partnerOf(members, { coupleId, memberId }) : undefined;
  const loading = settings === undefined || members === undefined
    || (partner !== undefined && (!worldRead || worldRead.for !== coupleId));
  const view = guardView({
    loading,
    hasPartner: partner !== undefined,
    stage: worldRead ? currentStage(worldRead.world) : 1,
    mode,
    opened,
  });
  const garden = view.view === 'garden' ? view.party : null;
  const prompting = view.view === 'prompt';

  // Latch the first answer, so nothing the stage or the partner does later can
  // put the prompt back over the garden.
  useEffect(() => {
    if (garden !== null && opened === null) setOpened(garden);
  }, [garden, opened]);

  useEffect(() => {
    if (!prompting || !coupleId || !memberId) return undefined;
    void stampGatePresence(coupleId, memberId).catch(() => {});
    const timer = setInterval(() => {
      void stampGatePresence(coupleId, memberId).catch(() => {});
    }, PRESENCE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [prompting, coupleId, memberId]);

  if (view.view === 'loading') return <p className="section-sub">Opening the gate…</p>;
  if (view.view === 'garden') return <>{children(view.party)}</>;
  if (!partner || !worldRead) return null;

  const { world } = worldRead;
  const name = partner.displayName?.trim() || 'your partner';
  const present = partnerAtGate(world.gate, partner.id, Date.now());

  const act = (action: PromptAction) => {
    const result = nextPrompt(step, action);
    if (!result.done) { setStep(result.step); return; }
    if (result.done === 'leave') {
      if (window.history.length > 1) navigate(-1); else navigate('/');
      return;
    }
    setMode(result.done);
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">Boss Gate</h1>
      </header>
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
              {present ? `${name} is at the Boss Gate` : 'The Boss Gate'}
            </h2>
            <p className="section-sub">
              {present
                ? 'Go in together, in party mode, and the boss pays out more.'
                : `The boss pays out more when ${name} is here too. Join party mode and wait at the gate for them.`}
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
            <h2 className="section-title">Go in without {name}?</h2>
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
    </div>
  );
}
