# Dashboard redesign — implementation plan

Spec: `../specs/2026-09-24-dashboard-redesign-design.md`. Small and self-contained.
If D has landed, rebase on it first, since both touch `DashboardPage.tsx`.

1. **Component** `app/src/features/dashboard/LogStrip.tsx`: live query on
   `todaysCharges(day)` and three `Link`s (Mood, Move, Work) using existing icons.
   No `loadSettings()` inside the live query (CLAUDE.md pitfall).
2. **CSS**: `.home-log` and `.home-log-item[data-lit]` next to the `.home-*` rules
   in `app/src/styles.css`, using existing tokens only (no new colours).
3. **Home**: render `<LogStrip day={day} />` between `.home-pet` and
   `<VitalsPanel>`, and drop the "Move" `Tile` from `.home-invite`.
4. **Check by hand**: log a mood, return to Home, and confirm Mood shows lit. Repeat
   at 390 px in both themes.
5. **Gates:** `npm run typecheck`, `npm test`, `APP_BASE=/ npm run build`,
   `npm run visual` (then delete `app/tools/baselines/`), and
   `npm run study:build` **last**, since `styles.css` changed.
