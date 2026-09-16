# Contributing

A two-person app, so this is short. The long version of the *why* behind any
rule here is in [`docs/DESIGN.md`](./docs/DESIGN.md); the UI specifics are in
[`docs/design-system.md`](./docs/design-system.md).

## Before you push

```bash
npm run typecheck
npm run check:config
npm run ui:check
npm test
APP_BASE=/ npm run build
npm run study:build      # if anything reachable from standalone.tsx changed
```

CI runs all of it, plus `npm run visual` and `npm run lighthouse`, which need
the build.

Two things guard security, and they answer different questions. `npm audit
--omit=dev` is a gate in CI and must stay at zero — it asks whether a
dependency that reaches a phone is known-vulnerable. CodeQL (its own workflow,
reporting to the Security tab) asks whether the code we wrote has a flaw in it,
which matters here because the Worker holds two OAuth flows and a pile of SQL
where every security property is a `WHERE` clause. Dev-toolchain advisories are
reported but never fail the build; Dependabot opens the upgrade PR instead.

## The five that bite

1. **`study/index.html` goes stale on far more than CSS, and rebuilding it is
   the *last* thing you do.** It inlines the whole stylesheet *and* the whole
   standalone bundle, so any change reachable from `app/src/standalone.tsx`
   moves its bytes. A rebuild that happens before one more commit lands is a
   rebuild that did not happen. CI fails on `git diff --exit-code`.

2. **A raw `<button>` fails review.** Use `PrimaryAction`, `SecondaryAction`,
   `Chip`, `ListRow` or `TileCard`. `npm run ui:check` enforces it as a
   ratchet: what already exists is recorded, and the build fails when a file
   gains a new one. If a bare button is genuinely right, add the file to
   `RAW_BUTTON_EXEMPT` **with a reason** — that is meant to be a review
   conversation.

3. **`db/repository/` is a directory, not a file.** A new section is a new
   file plus one `export *` in alphabetical order. Never append to an existing
   section; three PRs once broke `main` conflicting on the last line of the
   1,500-line original.

4. **Day keys use the member's timezone, never UTC**, and **nothing in daily
   life subtracts**. Health exists only inside a boss fight.

5. **Rules go in `domain/`, with a test beside them.** Pure TypeScript, no
   React, no Dexie. A rule that lives inside a component is a rule with no
   test — `.test.tsx` runs in jsdom and is for component *behaviour* a
   screenshot cannot see, not for logic that should not have been there.

## Commit messages

Say what changed and **why the alternative was worse**. This repo's history is
the design record — most of the reasoning in `docs/` started life in a commit
body. A message that only says what changed makes the diff say it twice.
