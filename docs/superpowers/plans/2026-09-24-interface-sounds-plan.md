# Interface sounds — implementation plan

Spec: `../specs/2026-09-24-interface-sounds-design.md`. Runs in a **separate cloud session**
on its own branch, in parallel with the D-pad and greeting work.

1. **Domain + test first** (`app/src/domain/audio/tones.ts`, `tones.test.ts`): write the
   tests from the spec's Testing list first, then the `TONES` table.
2. **Player** (`app/src/pwa/sound.ts`): a lazy `AudioContext` and
   `play(kind, { calm, enabled })`, using oscillator + gain envelopes and no output when disabled or unsupported.
3. **Setting**: `sound?: boolean` in `domain/types.ts` Settings, `setSound` in
   `db/repository/members.ts` beside `setHaptics`, and a toggle in `features/settings/SettingsPage.tsx`
   under the haptics toggle, disabled under Calm, default off.
4. **Wire**: in `ui/Toast.tsx` `ToastHost.show`, call `play()` with the same kind right after `buzz()`.
5. **Verify:** `npm run typecheck`, `npm test`, `APP_BASE=/ npm run build`, `npm run visual`
   (delete the frames after), and `npm run study:build` last.

**Coordination:** the D-pad/greeting branch also edits `app/src/styles.css` and regenerates
`study/index.html`. Whoever merges second: merge `main` in, keep both sides of any
`styles.css` hunk, and **regenerate** `study/index.html` with `npm run study:build`
rather than resolving it by hand.
