# Interface sounds — design

**Status:** approved 2026-09-24 (brainstorm, item C). Built in a separate session.

## Problem
Nothing in the app makes a sound except the Soundscapes page. Haptics exist
(`domain/feedback/haptics.ts`, `pwa/haptics.ts`) and fire from one place,
`ToastHost.show` in `ui/Toast.tsx`, but a phone on a table, or a laptop, gets
nothing.

## Decisions
| Question | Decision |
|---|---|
| Samples or synthesis? | Synthesis with the Web Audio API: no files, nothing to download, nothing to license. |
| Which sounds? | One per existing `HapticKind` (`tap`, `success`, `levelUp`, `error`). Sound follows the same vocabulary as the buzz, so there's no second list to keep in step. |
| Where does it fire? | The same line in `ToastHost.show` that calls `buzz()`. One call site, for the same reason haptics has one. |
| Default on or off? | **Off.** Sound is louder in a room than a buzz is in a pocket. `Settings.sound?: boolean`, absent = off, next to the haptics toggle in Settings. Calm forces it off, the same way it overrides haptics. |
| Volume | A master gain of ≤ 0.15, and every tone ≤ 400 ms with a soft attack and release (no clicks). |
| When is the AudioContext created? | Lazily, on the first `play()` after a user gesture, then reused. If it's suspended, call `resume()`. If it's missing, do nothing silently. |

## Design
1. **Domain** `app/src/domain/audio/tones.ts` (pure): `TONES: Record<HapticKind, Note[]>`
   where `Note = { freq, startMs, durMs, type: OscillatorType, gain }`, plus
   `toneLength(kind)`. `levelUp` is a rising three-note arpeggio, `success` two
   notes, `tap` one short blip, `error` a low falling pair.
2. **Player** `app/src/pwa/sound.ts`: `play(kind, { calm, enabled })` schedules
   an oscillator and a gain envelope for each note. It mirrors the shape of
   `pwa/haptics.ts` `buzz()`.
3. **Settings** gets `sound?: boolean` in `domain/types.ts`, a `setSound`
   repository function next to `setHaptics`, and a toggle in `SettingsPage`
   under the haptics one, disabled under Calm.
4. **Toast** `ToastHost.show` calls `play(sameKind, { calm, enabled: settings?.sound === true })`
   right after `buzz(...)`, before the state update, while the user activation
   is still live.

## Testing
`domain/audio/tones.test.ts`: every `HAPTIC_KINDS` entry has a tone and no
tone has a kind that doesn't exist (both directions), every tone is ≤ 400 ms,
every gain is ≤ 0.15, and every frequency is between 150 and 2000 Hz. The
player isn't unit-tested (it's a thin browser shim, like `pwa/haptics.ts`).
Then run `npm run typecheck`, `npm test`, the build, and `npm run visual` for
the Settings page.
