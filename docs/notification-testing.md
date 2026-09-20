# Testing notifications on real phones

Push is the one part of this app that cannot be proved by `npm test`. The
encryption is pinned against the RFC 8291 vectors in `worker/src/push.test.ts`
and the planner has its own unit tests, but nothing in CI can tell you whether
a notification actually arrived on an iPhone in somebody's pocket.

So this is the manual pass. It is written to be run by somebody who did not
write the code. You need **two phones** and about forty minutes.

## Why it has to be phones

Three constraints stack up, and none of them can be worked around:

- **iOS cannot schedule a local notification from a PWA.** Every notification
  this app sends is a Web Push from the Worker's cron. There is no offline path.
- **Push only works from a Home Screen install** on iOS 16.4 or newer. Safari
  tabs get nothing, and neither does the simulator.
- **Permission can only be asked from a tap**, and a denial cannot be undone
  without deleting the icon and adding it again. So if you deny by accident
  during a test, that phone needs a reinstall before it can be tested further.

A desktop browser will exercise the plumbing and is worth using for the
regression cases in §4, but it will not tell you what you need to know about
iOS.

## 1 · Before you start

**Check the deploy has keys at all.** Open `https://<your-app>/api/health` in a
browser:

```json
{ "ok": true, "db": true, "push": true, "vapidPublicKey": "BA…" }
```

If `push` is `false` or `vapidPublicKey` is `null`, the two Worker secrets are
not set and no notification can be delivered by anybody. See §5 of
`docs/DEPLOY.md`. The Settings screen says the same thing in words — "this
deployment has no notification key configured" — rather than offering a switch
that cannot work.

**Install on both phones.** Safari → Share → Add to Home Screen. Open the app
from the icon, not from Safari.

**Pair them**, if they are not already. Reminders are refused while unpaired —
there is nobody to remind you about yet — and Settings says so.

**Turn reminders on, on both.** Settings → Reminders → Turn on. Accept the
system prompt. You should see "Reminders on. *n* queued for the next few days."

Note which phone is which. Below, **A** is the phone you act on and **B** is
the one that should hear about it.

## 2 · The matrix

Work down it. Each row is independent; a failure does not block the next.

| # | Scenario | Do this | Expect |
|---|---|---|---|
| 1 | Foreground | Keep A open. Trigger a nudge for A (§3). | No OS banner, or a silent one. The in-app headline bar updates if it was a cheer or a quest. |
| 2 | Backgrounded | Lock A. Trigger a nudge for A. | Banner on the lock screen within ~60s. |
| 3 | Fully closed | Force-quit A from the app switcher. Trigger a nudge. | Banner arrives. Tapping it **opens the app on the right screen** — see §4.2. |
| 4 | Both phones | Log a workout on A with at least one set, then Save. | B gets "They moved today" within ~60s. A gets nothing. |
| 5 | Re-saving | On A, add another set and Save again. Repeat three times. | B is told **once, in total, for that day.** More than one banner is a bug. |
| 6 | Permission denied | On a third install (or after a reinstall), refuse the prompt. Log a workout. | Nothing crashes. Settings explains that notifications are blocked and how to undo it. The headline bar still works. |
| 7 | Subscription expired | See §4.1. | Reminders resume without anybody visiting Settings. |
| 8 | Quiet hours | Settings → What time → 03:00. | The screen says out loud that it will arrive at 08:00 instead. The nudge is **moved, not dropped**. |
| 9 | Nothing to nag about | Log today on A, then re-open the app. | No daily reminder is queued for today. `planNudges` skips a day already logged. |

Row 5 is the one most likely to regress. Saving on the Move screen happens
repeatedly as sets go in one at a time, and the endpoint is the only thing
stopping that from becoming six banners.

## 3 · Triggering a nudge without waiting until evening

The cron runs **every minute**, and the drain sends anything whose `fire_at`
has passed. So the fastest way to test delivery is to write a row in the past
and wait up to a minute.

Find the member id you want to nudge:

```bash
npx wrangler d1 execute heartbeat --remote \
  --command "SELECT id, couple_id FROM members WHERE revoked_at IS NULL"
```

Queue one for it:

```bash
npx wrangler d1 execute heartbeat --remote --command "
  INSERT INTO scheduled_nudges (key, couple_id, member_id, fire_at, title, body, path)
  VALUES ('manual-1', '<couple_id>', '<member_id>', 0, 'Test', 'A test nudge.', '/#/mood')"
```

`fire_at = 0` is in the past, so the next tick claims it. Watch it go:

```bash
npx wrangler tail --format pretty
```

To see what is queued and what has already gone out:

```bash
npx wrangler d1 execute heartbeat --remote --command "
  SELECT key, member_id, fire_at, delivered_at, path FROM scheduled_nudges
  ORDER BY fire_at DESC LIMIT 20"
```

A row with `delivered_at` set has been claimed and will not be sent again. That
is deliberate — see the comment on `drainNudges` — so to re-test a key, delete
the row rather than nulling the column.

Setting `path` to something other than `/#/mood` is worth doing at least once;
§4.2 is why.

## 4 · Regression cases

Two bugs shipped in this area and both were invisible from the app. Re-check
them whenever anything near notifications changes.

### 4.1 · Reminders must survive three days of not opening Settings

`planNudges` plans `HORIZON_HOURS` — three days — ahead, and every post
replaces the whole queue. For a long time the only thing that refilled it was a
tap on the Settings switch, the hour or a kind. Three days after the last visit
to Settings, the queue ran dry and reminders stopped permanently. Turning them
on and then simply *using* the app for a week was enough to lose them.

`pwa/nudgeSync.ts` now re-plans on launch, on foreground and when the network
comes back. To check it:

```bash
# Empty the queue for one member, as if the horizon had run out.
npx wrangler d1 execute heartbeat --remote --command "
  DELETE FROM scheduled_nudges WHERE member_id = '<member_id>' AND delivered_at IS NULL"
```

Confirm it is empty, then **background and re-open the app on that phone
without going near Settings**, and query again. Rows should be back.

If they are not, the re-plan is not running. The likely causes, in order: the
phone is offline, `notifyOn` is not actually `true` in Settings, or the device
is unpaired.

### 4.2 · Tapping a notification must land on the right screen

The service worker builds its target from `registration.scope` and the stored
`path`. Four things write that path and they did not agree on whether it starts
with `/#`, so three of the four produced `host/#/#/mood` — a route the app does
not have — and landed on the not-found screen. Only the boss nudge worked.

`domain/notify/target.ts` now normalises both spellings. Its unit tests cover
the logic; what they cannot cover is the real `registration.scope` on a real
install, so **tap the notification** in rows 2 and 3 above and confirm you land
on the screen it is about, not on home and not on "nothing here".

Worth testing with at least two different paths, since they come from different
producers:

| Path to queue | Should open |
|---|---|
| `/#/mood` | Mood |
| `/boss` | The boss fight |
| `/#/activities/support` | Support |
| garbage, e.g. `https://example.com` | Home. **Never** the external site. |

That last row is the security case: a path reaching `clients.openWindow` is an
open redirect with a notification as the bait, and the Worker inserts rows
directly without going through `/api/nudges`'s allowlist.

## 5 · When a push does not arrive

Work down this list before assuming the code is wrong.

1. **Is it a Home Screen install?** A Safari tab gets nothing on iOS.
2. **Is the subscription still there?** Settings should say "On". If it says
   "Off" the phone has lost its subscription and needs the switch tapped again.
3. **Did the Worker try?** `npx wrangler tail` shows the drain. `claimed` above
   zero with `sent` at zero means the push service refused.
4. **Was the endpoint dropped?** A 404 or 410 from the push service means the
   subscription is dead, and `drainNudges` deletes it — correctly, because
   retrying it every sixty seconds is forever. Check:

   ```bash
   npx wrangler d1 execute heartbeat --remote --command "
     SELECT member_id, substr(endpoint, 1, 40) FROM push_subscriptions"
   ```

   No row for that member means the phone must re-subscribe: Settings → turn
   off, turn on.
5. **Known WebKit behaviour.** APNs can answer `201` while the service worker
   never receives the `push` event. This is out of this app's control and has
   been reported upstream by others. If the drain reports `sent` and the phone
   shows nothing, and steps 1-4 are clean, this is the likely cause. The in-app
   headline bar is the fallback: everything a push would have told you is also
   derivable from synced state, so nothing is only ever delivered by push.

## 6 · What is covered automatically

Do not re-test these by hand; they have unit tests that will fail first.

| Covered by | What it pins |
|---|---|
| `worker/src/push.test.ts` | Both RFC 8291 §5 vectors, the VAPID header, the drain's claim-before-send, dead-endpoint removal |
| `app/src/domain/notify/schedule.test.ts` | One reminder a day at most, days already logged skipped, night hours moved not dropped, DST |
| `app/src/domain/notify/target.test.ts` | Both path spellings, the four paths the shipped producers write, and every escape attempt in §4.2 |
| `app/src/domain/notifications/derive.test.ts` | What earns a badge and a headline, and that no component counts its own |
