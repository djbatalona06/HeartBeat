## What changed, and why the alternative was worse

<!-- Same bar as a commit message per CONTRIBUTING.md: say what changed and
     why the other option didn't win. The diff already says what changed. -->

## Before merging

- [ ] `npm run typecheck`
- [ ] `npm run check:config`
- [ ] `npm run ui:check`
- [ ] `npm test`
- [ ] `APP_BASE=/ npm run build`
- [ ] `npm run study:build` — only if this PR touches anything reachable from
      `app/src/standalone.tsx` (see "The five that bite" #1 in
      [CONTRIBUTING.md](../CONTRIBUTING.md))

Re-read [CONTRIBUTING.md](../CONTRIBUTING.md#the-five-that-bite) — "The five
that bite" — before pushing rather than after CI catches it.
