import {
  INVITE_TTL_MS,
  authenticate,
  json,
  newInviteCode,
  type Env,
} from '../_lib';
import { INVITE_INSERT_SQL } from '../_offboard';

/**
 * A fresh invite for a seat that is free in the caller's own couple.
 *
 * Used after a partner leaves or is removed. The refusal is the same sentence
 * join uses, because it is the same fact: two live members is a full couple.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const caller = await authenticate(request, env);
  if (!caller) return json({ error: 'not paired' }, 401);

  const now = Date.now();
  const invite = newInviteCode();
  const { meta } = await env.DB.prepare(INVITE_INSERT_SQL)
    .bind(invite, caller.coupleId, now, now + INVITE_TTL_MS, caller.coupleId)
    .run();
  if (meta.changes !== 1) return json({ error: 'this couple is full' }, 409);

  return json({ invite, expiresAt: now + INVITE_TTL_MS });
};
