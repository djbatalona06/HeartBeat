import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useToast } from '../../ui/Toast';
import { db, loadSettings } from '../../db/database';
import { ensureIdentity, grantLifeEvent } from '../../db/repository';
import { todayKey } from '../../domain/day';
import { levelOf, sheetFor } from '../../domain/rpg/avatar';
import { dyeStyle } from '../../domain/rpg/dyes';
import { costumeById } from '../../domain/rpg/costumes';
import { FALLBACK_MASCOT_ID, MASCOT_ROSTER, getMascot } from '../pet/mascots';
import { CostumeLayer } from './art/costumes';
import { GOOD_VIBES_PER_SENDER_PER_DAY } from '../../domain/rpg/lifeEvents';
import { petArt } from './art/pets';
import { PrimaryAction } from '../../ui/PrimaryAction';
import type { Avatar } from '../../domain/rpg/types';
import { PageTitle } from '../../ui/layout/PageTitle';
import { GUIDES } from '../guide/guides';

/**
 * Tree Town, with one other house in it.
 *
 * Finch's Friends tab is a town of everyone you have added. This app is for
 * two people, so the honest version of that screen is the other one of you:
 * their bird, how long you have both been at it, and the one thing you can
 * send them. A list UI with a single row in it, or an invite flow with nobody
 * to invite, would both be a bigger screen saying less.
 *
 * Friendship is counted, not stored. It is the days the two of you have both
 * been on the record — derived here from the same `lifeEvents` rows the grant
 * writes, so there is no second number that can disagree with the first.
 */
export function FriendsPage() {
  const settings = useLiveQuery(loadSettings, []);
  const [identity, setIdentity] = useState<{ memberId: string; coupleId: string } | null>(null);
  const { say } = useToast();
  const [note, setNote] = useState('');

  useEffect(() => {
    let live = true;
    ensureIdentity().then((next) => { if (live) setIdentity(next); }).catch(() => {});
    return () => { live = false; };
  }, []);


  const memberId = settings?.memberId ?? identity?.memberId;
  const coupleId = settings?.coupleId ?? identity?.coupleId;
  const day = todayKey(settings?.timeZone ?? 'America/Los_Angeles');

  const members = useLiveQuery(
    async () => (coupleId ? db.members.where('coupleId').equals(coupleId).toArray() : []),
    [coupleId],
  );
  const partner = useMemo(
    () => (members ?? []).find((m) => m.id !== memberId),
    [members, memberId],
  );

  const partnerAvatar = useLiveQuery(
    async () => (partner ? db.avatars.get(partner.id) : undefined),
    [partner?.id],
  );
  const partnerPets = useLiveQuery(
    async () => (partner ? db.pets.where('memberId').equals(partner.id).toArray() : []),
    [partner?.id],
  );
  const events = useLiveQuery(
    async () => (coupleId ? db.lifeEvents.where('coupleId').equals(coupleId).toArray() : []),
    [coupleId],
  );

  // Distinct days with something on them, either side. A count of days rather
  // than of events, for the reason every quest measure is: a busy Tuesday is
  // still one Tuesday.
  const friendship = new Set((events ?? []).map((e) => e.day)).size;
  // Counted, not a boolean. The cap is three a day and this said one, so the
  // button went dead after a single send while the domain would happily have
  // taken two more. The number comes from the domain module now, so the screen
  // no longer carries its own copy of the rule.
  const sentToday = (events ?? []).filter(
    (e) => e.kind === 'good-vibes' && e.day === day && e.fromMemberId === memberId,
  ).length;
  const vibesLeft = Math.max(0, GOOD_VIBES_PER_SENDER_PER_DAY - sentToday);

  const companion = partnerAvatar?.companionId
    ? (partnerPets ?? []).find((p) => p.id === partnerAvatar.companionId)
    : undefined;

  async function sendVibes() {
    if (!partner || !coupleId || !memberId) return;
    const result = await grantLifeEvent(coupleId, partner.id, 'good-vibes', day, {
      fromMemberId: memberId,
      note: note.trim() || undefined,
    });
    if (!result.ok) { say(result.reason ?? null, 'error'); return; }
    setNote('');
    say('Sent. They will find it waiting.');
  }

  return (
    <div className="page">
      <header className="page-head">
        <PageTitle guide={GUIDES.friends}>Partner</PageTitle>
        <p className="page-sub">See their birb, your shared days, and send a little support.</p>
      </header>

      {!partner ? (
        <section className="panel">
          <h2 className="section-title">Your partner will appear here</h2>
          <p className="section-sub">
            Pair their phone in <Link to="/settings">Settings</Link>. Once they join, this is where you will
            see their birb and send them a little support.
          </p>
        </section>
      ) : (
        <>
          <PartnerHouse
            partner={partner}
            avatar={partnerAvatar}
            friendship={friendship}
            companionId={companion?.kindId}
          />

          <GoodVibes name={partner.displayName || 'your partner'} vibesLeft={vibesLeft} note={note} onNote={setNote} onSend={sendVibes} />
        </>
      )}
    </div>
  );
}

interface PartnerHouseProps {
  partner: { displayName?: string };
  avatar: Avatar | undefined;
  friendship: number;
  companionId: string | undefined;
}

/**
 * The other house in town: their bird, as their app draws it, in their colours.
 *
 * Which mascot is theirs travels on their avatar (`Avatar.mascot`, written by
 * `MascotSync`), because the mascot follows the theme and the theme is a
 * per-phone preference. Drawing `getMascot(myTheme)` here showed you your own
 * bird under their name. Until their app has written the field once (an older
 * install), the companion they walk with in Eve's Garden stands in, so the
 * house is never empty and never shows the wrong bird.
 */
function PartnerHouse({ partner, avatar, friendship, companionId }: PartnerHouseProps) {
  const name = partner.displayName || 'Them';
  const known = avatar?.mascot && avatar.mascot in MASCOT_ROSTER ? avatar.mascot : undefined;
  const CompanionArt = !known && companionId ? petArt(companionId) : undefined;
  // Neither has reached this phone yet -- a fresh pairing, or their app has
  // not synced since. The default mascot stands in rather than an empty box,
  // and the line under it says why it may not be theirs.
  const waiting = !known && !CompanionArt;
  const mascot = known ? getMascot(known) : waiting ? getMascot(FALLBACK_MASCOT_ID) : undefined;
  const costume = costumeById(avatar?.costume);

  return (
    <section className="panel">
      <h2 className="section-title">{name}'s corner</h2>
      <div className="friend-house">
        {/* Their colourway, not yours -- the dye lives on their avatar. */}
        <div
          className="friend-birb"
          style={dyeStyle(avatar?.dye) as React.CSSProperties}
          role="img"
          aria-label={mascot ? `${name}'s ${mascot.name}, ${mascot.species}` : `${name}'s birb`}
        >
          {mascot ? <mascot.Art mood="content" /> : null}
          {known ? <CostumeLayer id={avatar?.costume} mascot={known} /> : null}
          {CompanionArt ? <CompanionArt /> : null}
        </div>
        <dl className="friend-facts">
          <div>
            <dt>Shared days</dt>
            <dd>{friendship} {friendship === 1 ? 'day' : 'days'}</dd>
          </div>
          <div>
            <dt>Level</dt>
            <dd>{avatar ? levelOf(avatar) : '—'}</dd>
          </div>
          <div>
            <dt>Coins</dt>
            <dd>{avatar ? sheetFor(avatar).coins : '—'}</dd>
          </div>
        </dl>
      </div>
      <p className="section-sub friend-companion">
        {waiting ? `Still syncing ${name}'s birb.` : mascot ? `${mascot.name} the ${mascot.species} is keeping them company.` : ''}
        {costume ? ` Wearing the ${costume.name.toLowerCase()}.` : ''}
      </p>
    </section>
  );
}

interface GoodVibesProps {
  name: string;
  vibesLeft: number;
  note: string;
  onNote: (note: string) => void;
  onSend: () => void;
}

function GoodVibes({ name, vibesLeft, note, onNote, onSend }: GoodVibesProps) {
  return (
    <section className="panel">
      <h2 className="section-title">Send {name} a little support</h2>
      <p className="section-sub">
        Send up to {GOOD_VIBES_PER_SENDER_PER_DAY} each day. Every one gives them energy and costs
        you nothing; a note is optional.
      </p>
      <input
        className="field"
        value={note}
        maxLength={140}
        placeholder="Thinking of you"
        aria-label="A note to send with it"
        onChange={(event) => onNote(event.target.value)}
      />
      <PrimaryAction
        disabled={vibesLeft === 0}
        onClick={onSend}>{vibesLeft === 0
          ? `That is ${GOOD_VIBES_PER_SENDER_PER_DAY} for today`
          : `Send support (${vibesLeft} left)`}</PrimaryAction>
    </section>
  );
}
