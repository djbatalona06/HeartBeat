import { authenticate, json, recordAuthEvent, type Env } from '../_lib';
import { releaseMember } from '../_offboard';

/**
 * Leave the couple. The caller turns *itself* off.
 *
 * Nothing of the couple's is deleted: entries, holdings and photos stay for the
 * other half, whose history this is too. What goes is whatever could still act
 * for the leaver — see _offboard.ts. The seat is freed, so /api/pair/invite can
 * fill it.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const caller = await authenticate(request, env);
  if (!caller) return json({ error: 'not paired' }, 401);

  const now = Date.now();
  await releaseMember(env.DB, caller.coupleId, caller.memberId, now);
  await recordAuthEvent(
    env.DB,
    request,
    { kind: 'revoke', coupleId: caller.coupleId, memberId: caller.memberId, detail: 'left' },
    now,
  );
  return json({ ok: true });
};
