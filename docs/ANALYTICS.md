# What the product counts can and cannot tell you

The server sends anonymous counts to PostHog (`app/functions/api/_track.ts`, set-up in
`docs/DEPLOY.md` §10). This is the map from a question to the event that answers it, and
an honest note on what none of them can.

## Questions and where the answer is

| Question | Event | How to read it |
|---|---|---|
| Do couples actually finish pairing? | `pair_started` → `pair_completed` | Funnel. A low rate points at the invite flow. `pair_failed` has a `reason` (`no-such-invite`, `expired`, `already-used`, `couple-full`, `raced`). |
| Which trackers do people use? | `entries_synced` | `kinds` is a comma list (`mood,exercise`). Break down by it, or search for one kind. |
| Is the RPG layer used at all? | `holdings_synced` | Same shape. Weekly count of couples with one. |
| Do people talk in the app? | `message_sent` | Weekly distinct couples (group `couple`). |
| Is the kind-words feature landing? | `compliment_sent` | `generated` says whether the model wrote it, `scheduled` whether it was set for later. |
| Are photos worth the storage? | `photo_uploaded` | Weekly count against active couples. |
| Do people turn reminders on? | `push_subscribed` | Count of members; compare with members that paired. |
| Is Ask used, and Dictation? | `ask_used`, `transcribe_used` | These cost neurons from a shared daily allowance, so this is also the spend signal. |
| Is the study link used? | `study_linked`, `study_session_credited` | `kind` and `capped` show what sort of sessions, and how often the 120 XP day is reached. |
| Where does it fall over? | `client_error` | `scope` and `route`. Never the message or the stack. |
| Do people stick around? | any event | Retention on a couple, using the `couple` group. |

## What it cannot tell you

- **Whether something felt good.** A count says a thing happened, not that it was liked. If a
  feature is used once and never again, that is a signal; whether it was confusing or simply
  finished is not.
- **Where in a screen someone got stuck.** There is no client-side capture, by design, so no
  clicks, scroll depth, recordings or funnels inside a page.
- **Which card confused someone in the study app.** Only whole sessions are reported.
- **Anything about content.** `scrub()` drops it. That is the point.

If those gaps matter more than the promise, the honest options are a short opt-in survey inside
the app (the person chooses to answer), or opt-in client analytics behind a consent screen.
Both are product decisions, and the README would have to change with them. Neither should be
added quietly.

## First dashboard, once events arrive

Do not build it before then: PostHog will only chart events it has seen. After a week of real
use, create one dashboard with:

1. Funnel `pair_started` → `pair_completed`.
2. Weekly distinct couples (group `couple`) for `entries_synced`, `message_sent`, `holdings_synced`.
3. `entries_synced` broken down by `kinds`.
4. `client_error` broken down by `route`.
5. `study_session_credited` broken down by `kind`, with the `capped` share.
6. `ask_used` and `transcribe_used` daily, since they draw on a shared allowance.

Watch the monthly event count. `entries_synced` and `holdings_synced` fire once per sync that
wrote something and are the bulk of the volume; sample them before the free allowance is close.
