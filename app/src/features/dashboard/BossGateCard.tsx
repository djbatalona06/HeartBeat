import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { loadWorldProgress } from '../../db/repository';
import { partnerAtGate } from '../../domain/rpg/raidGate';
import { promptApplies } from '../../domain/rpg/gatePrompt';
import { currentStage } from '../../domain/rpg/world';
import { Tile } from '../../components/Tile';
import { partnerOf } from '../pairing/namingGate';

/**
 * The way into Eve's Garden from Home.
 *
 * The gate used to be reachable only through Menu > The app, which is why it
 * could not be found. This is a tile on the screen the app opens on. It says
 * something about the partner only when the next stage is the boss -- stages 1
 * to 6 are asynchronous and never wait on anybody -- and then only that they are
 * at the gate or that the boss pays more with them, never that anything is
 * being waited for.
 */
export function BossGateCard({ coupleId, memberId }: {
  coupleId: string | undefined;
  memberId: string | undefined;
}) {
  const members = useLiveQuery(
    async () => (coupleId ? db.members.where('coupleId').equals(coupleId).toArray() : []),
    [coupleId],
  );
  const worldRead = useLiveQuery(
    async () => (coupleId ? { for: coupleId, world: await loadWorldProgress(coupleId) } : undefined),
    [coupleId],
  );

  const partner = partnerOf(members, { coupleId, memberId });
  const world = worldRead && worldRead.for === coupleId ? worldRead.world : undefined;
  const boss = world !== undefined && promptApplies(currentStage(world), partner !== undefined);
  const name = partner?.displayName?.trim() || 'Your partner';

  const hint = !boss
    ? 'The islands, and what stands on them.'
    : partnerAtGate(world?.gate, partner?.id, Date.now())
      ? `${name} is at the gate.`
      : 'The boss is next. It pays more with two.';

  return (
    <Tile to="/eve-garden" title="Eve's Garden" icon="sword" value={boss ? 'The boss' : 'Enter'} hint={hint} />
  );
}
