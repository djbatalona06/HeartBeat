# HeartBeat — app-level scan, combat rebalance, and Islands 11–20 plan

**Prepared:** 2026-10-12 · **Checked in:** 2026-10-13
**Scope:** Repository-level product, combat, PWA, accessibility, and progression review of `djbatalona06/HeartBeat` (branch `main`).
**Status:** The product decisions from 2026-10-12 are settled. This is the source of truth for the next round of combat and Islands 11–20 work.

## Progress

| Item | State |
| --- | --- |
| §2.4 `canBeatEncounter` evaluator | **Built.** `game/HeartBeat.Game.Core/Forecast.cs`, tests in `ForecastTests.cs`. Pure C#, read-only: it changes no fight and no balance value. |
| §2.4 pre-fight forecast UI, "Why?" sheet, assist opt-in | Not started. Needs an `Api`/`Bridge` entry and a screen. |
| §2.4 authored assist variants | Not started. This is a balance change and needs its own PR. |
| §3 level cap 50, Islands 11–20, 3D chapter, partner row | Not started. |
| §4 iOS accessibility checks | Not started. |

## Executive read

HeartBeat is already a substantial mobile-first wellness PWA with a seven-element, ten-island RPG, multiple wellness and relationship features, a shared garden/raid layer, offline support, and a deliberate design system. The "AAA on a bootstrap budget" path is **not** to make every screen or monster bespoke. It is to protect the app's warm, readable, emotionally safe identity; make the combat curve feel fair and authored; spend bespoke art/audio only on high-salience moments; and build the rest from consistent reusable systems.

Four decisions anchor the next pass:

1. **Make difficulty player-aware.** Replace a blanket damage-curve change with a `canBeatEncounter(player, encounter)` evaluator that estimates whether the current game build can win, then selects visible, bounded assistance when the encounter would otherwise be an unfair wall. Do not use wellness history or partner attendance as proxies for player skill.
2. **Keep the level cap at 50.** Islands 11–20 become a horizontal/postgame progression chapter after Island 10, with more meaningful high-rarity gear and companion rewards — not another four-level band per island.
3. **Make 3D an earned, reversible presentation upgrade.** After Island 10's boss, show the agreed welcome prompt and let the player choose 3D or stay in 2D. Once unlocked, expose a persistent 2D/3D choice for every later battle. Both modes share mechanics and accessibility; the partner remains an invitation, never a gate.
4. **Treat iOS accessibility as a shipped quality bar.** Preserve current foundations and add the accepted 44×44 CSS-pixel preferred control target, then verify real iPhone/iPad Safari behavior with VoiceOver, text enlargement, focus, orientation, safe areas, and motion preferences — not axe alone.

## 1. What is already working

These are advantages to preserve, not rebuild:

- **Product breadth and app structure:** React/Vite/TypeScript PWA, Cloudflare Pages API functions, a Cloudflare Worker, and a separate C# game engine. Feature code is organized around domain logic and repositories rather than letting every screen own its own rules.
- **The world is real content:** ten built islands, seven stages per island, light and dark faces, and a tested TypeScript island-map mirror of C# content. The island tests assert stage shape, element relationships, progression bands, light/dark difficulty, and simulated win rates.
- **Combat is deterministic and testable:** seeded combat, planned/telegraphed behaviors, guard/shield absorption, healing fade, and simulation-based balance tests. The C# tests require at least 80% win rate on light stages at arrival level and at least 70% on dark stages one level later.
- **Wellness fit is intentional:** seven elements map to the app's seven logged wellness axes. Losing an encounter costs the fight, not persistent health or progress. Keep that contract.
- **Accessibility foundations:** theme and colour contrast have dedicated tests, including text on top of the moving garden; calm/reduced motion is honoured; controls share a tap-size token; the shell accounts for iOS safe areas and hides the docked tab bar while the keyboard is open. The visual walk injects axe on representative screens.
- **Thoughtful mobile navigation:** six equal-width bottom tabs keep their labels, and active state is not conveyed by colour alone.
- **Offline and privacy work are deliberate:** the PWA/service worker, sync, authentication/recovery, and server routes have explicit boundaries. New progression persistence must follow them and must not create another source of truth.

## 2. Combat scan: where to lower enemy damage

### 2.1 Island encounters (the main target)

The incoming-damage rule is in `game/HeartBeat.Game.Core/Battle.cs`:

`damage = round(max(1, (enemyAttack × movePower / 10 − playerDefense / 2) × behaviorScale × wobble × attackDownFactor))`

Shield absorbs before HP. Behaviours change the shape: a Swarm splits a turn into two half-strength hits, a Bruiser telegraphs a stronger blow, a Guardian spends a turn on guard, a Drainer spends a turn on its drain. The dark face multiplies enemy HP, Attack and Defense by **1.25** and leaves Speed alone.

Representative late-game example: Island 10's Cascade Warden (Attack 593, a 15-power attack) against a level-44 player (3,326 max HP, 254 Defense) gives about **763 damage before behaviour and wobble, about 23% of max HP**. A high roll reaches about **915 (28%)**. On the dark face, the comparable upper outcome is about **1,182**, still around **32% of level-45 HP**. Because the boss is a Swarm, that arrives as two smaller hits in one turn. This is a real, measurable late-game spike. It does not make the fight unwinnable, but it is a strong candidate for smoothing.

### 2.2 Garden/adventure encounters are a third, fixed-stat system

`app/src/domain/rpg/enemies.ts` defines three fixed-stat nuisances (snail, magpie, wasp) with flat power **3 / 5 / 7**. `encounter.ts` applies ±20% seeded variance. These enemies do not scale with island rank, on purpose: they are optional, fleeing is free when it works, and being down costs nothing. Keep that. If their screen lacks a clear optional-difficulty cue or a readable pre-fight retreat choice, fix the UX before lowering their power.

### 2.3 Co-op raid boss is a distinct system

`app/src/domain/rpg/boss.ts` and `worker/src/boss.ts` define a tier step of **1.25** for raid-boss HP and a `bossDamage` value (18 at tier 1; pinned tests show 23 at tier 2 and 44 at tier 5). The scan found no runtime call path for `bossDamage`. **Do not tune it blindly.** Decide first whether it is meant to be enemy output. If it is unused, wire it intentionally with tests or remove it in a separate cleanup.

### 2.4 Player-specific beatability function

"Player to beat function" means **"can this current player build beat this encounter?"**, not a new opponent.

**Built as `Forecast.For(monster, level, boosts)`** in `game/HeartBeat.Game.Core/Forecast.cs`. It returns:

| Field | Meaning |
| --- | --- |
| `SimpleWinRate` | Win share over 60 seeded fights with the simple policy (heal under 35%, otherwise the hardest ready attack). This is the same policy every island balance test uses: `Sim` in the test project now calls it. |
| `CarefulWinRate` | Same seeds, careful policy: heals under 50%, guards when a heavy blow is telegraphed, re-picks its best attack every turn. |
| `ExpectedRounds` | Median rounds in won fights. |
| `MedianEndingHp`, `LowerTailHp` | Median and 10th-percentile HP share at the end. A loss counts as 0. |
| `Verdict` | `Likely` at 80% or more simple-play wins, `Close` from 50%, otherwise `Tough`. Read from the simple player, because the forecast is for whoever is holding the phone. |
| `AssistSuggested` | True whenever the verdict is not `Likely`, which means below the stage target. |
| `Why` | Up to three `{ Code, Text }` reasons, each about the fight: a big hit as a share of health, the monster's rhythm, "heal a little earlier" when careful play wins 20 points more often, the weakness (or "today's logging hits its weak spot"), and "Spell goes straight through" when defence makes Spell the better hit. |

It reads only the fight's own inputs: combat level, unlocked moves, today's charges and raid sheet (`Boosts`), the monster's face, stats and behaviour. It never reads mood entries, quiet weeks, relationship status or partner attendance, and a test checks that no reason text talks about the person. It changes nothing in a fight.

**Sample forecasts** (no gear, no charges unless noted), for the wording review:

| Build | Verdict | Simple / careful | "Why?" codes |
| --- | --- | --- | --- |
| Day one, Island 1 stage 1, level 1 | Likely | 100% / 100% | weakness |
| Island 1 boss, level 8 (arrival) | Likely | 100% / 100% | big-hits, heavy-blow, weakness |
| Island 1 boss, level 1 | Tough | 0% / 0% | big-hits, heavy-blow, weakness |
| Island 10 boss, level 44 (arrival) | Likely | 95% / 100% | big-hits, two-blows, weakness |
| Island 10 boss, dark, level 45 | Likely | 88% / 100% | big-hits, two-blows, weakness |
| Island 10 boss, level 42 | Tough | 30% / 88% | big-hits, two-blows, heal-earlier |
| Island 10 boss, level 42, every raid stat 40 | Close | 78% / 100% | big-hits, two-blows, heal-earlier |

The level-42 Warden rows are the clearest case for the design. The fight is not a wall: careful play wins 88% of the time. The useful thing to say is "heal a little earlier", not "this is too hard".

**Still to build:**

- **Pre-fight forecast screen.** Show the qualitative label ("Good chance with this build" / "Could go either way" / "This may be tough"), never the percentage. An optional **Why?** shows the reasons in plain language. Needs an `Api.Forecast` + `Bridge` entry, then the screen.
- **Assist as an explicit opt-in** at that point: **Start as designed** or **Use a gentle assist**. The assist may improve telegraph readability and defensive opportunity, then choose a **pre-authored** easier behaviour/stat variant. Keep the enemy's identity. Never change damage after the fight starts. Declining must not block or delay the fight. An assist is support, not a separate reward tier or a stigma label.
- **Assist variants and their tests.** Low-gear, high-gear, simple and careful builds; Island 10's Warden spike; Swarm's combined turn; healers ending; 2D and 3D giving identical outcomes; no required activity or partner presence.

The current floors stay the initial targets: 80% on light stages at arrival, 70% on dark stages with the extra level.

## 3. Islands 11–20: progression prerequisite and content slate

### 3.1 Progression gate and the level-50 decision

**Accepted direction: combat level cap 50.** Drop the assumption that each future island needs another four combat ranks. Island 11 unlocks after Island 10's boss; Islands 12–20 unlock through sequential world/story completion (or an explicitly chosen catch-up route), not a higher level gate. The ten islands are a horizontal postgame chapter: enemy identity, tactical patterns, player-aware beatability, pet/gear choices, collection and presentation carry progression after level 50. No automatic stat escalation just to make the cap feel relevant.

Update C# `Progression.MaxLevel` and the TypeScript XP display in lockstep. Make levels 47–50 a short, rewarding bridge into the new chapter, tuned so it does not need daily streaks or unusually high activity. Level 50 gets a meaningful, celebratory capstone reward. At the cap, handle further XP explicitly (a completed bar; optional rewards through existing chest/drop systems). The bar must not overflow, and no new currency.

Keep the Common → Rare → Epic → Legendary → Mythic ladder; **no tier above Mythic**. Make late-game rewards feel grander through distinctive Mythic gear and companion variants, authored set identity, optional side-grades/passives, expressive 3D presentation, and high-rarity rewards from island milestones and bosses, all inside the shared tier system and bounded stat budgets. Mythic equipment must never be required for ordinary completion.

The build still needs `Island11.cs`–`Island20.cs`; C# `World` count/list/dark-name aggregation; the TypeScript `ISLANDS` mirror and gate/map support; stage/boss names and sprite keys; level-50 progression/XP/overflow behaviour; rarity, gear and companion rewards; and tests for all of it. Keep the seven-element rule and the stage shape (`Common, Common, Common, SemiBoss, Common, Elite, Boss`), the stage-5 breather, unique ids, light/dark names, readable behaviour, and a memorable boss on each island.

### 3.2 Draft concept slate for discussion

A second cycle through the seven wellness elements with matured themes. Names, elements and mechanics are proposals, not approved canon. Islands 11–20 are the post-Island-10 3D chapter; players may still choose 2D.

| # | Island (light / dark face) | Element | Signature idea / low-cost gameplay identity |
| --- | --- | --- | --- |
| 11 | **Cloudglass Canopy / The Still-Air Crown** | Movement | A vertical forest of suspended bridges; short movement bursts and falling-leaf telegraphs. |
| 12 | **Saffron Rainmarket / The Empty Market** | Nourishment | A rain-soaked night market; alternating "share / hoard" shield and recovery patterns. Warm lantern palette, reuses food-creature rigs. |
| 13 | **The Listening Archive / The Unwritten Vault** | Focus | Floating library shelves; predictable feints, delayed attacks, clean telegraph language. Legibility over visual noise. |
| 14 | **Firefly Jubilee / The Quiet Parade** | Mood | A festival route; rhythmic, colour-independent cues and a slow boss wind-up. Sound optional and captionable. |
| 15 | **Moonwell Sanctuary / The Sleepless Deep** | Rest | A still-water refuge; defensive/healer enemies, with the existing heal fade so the boss cannot stall. |
| 16 | **The Hand-in-Hand Harbor / The Unmoored Reach** | Bond | Two linked docks and paired enemy tells; readable by one player first, partner presence a bonus, never a gate. |
| 17 | **The Turning Seasons / The Split-Year** | Balance | Four seasonal micro-biomes; the elite teaches a fair stance-change rule before the boss. |
| 18 | **The Orchard Above the Clouds / The Withered Bough** | Nourishment | Cultivation/revival motif; Island 2's family silhouettes at elder scale, not its colour treatment. |
| 19 | **Tide of Quiet Stars / The Undertow** | Rest | A night-ocean return to rest; patient, clearly telegraphed cycles, no high-frequency flashing or unavoidable burst. |
| 20 | **The Heartbeat Confluence / The Hollow Pulse** | Bond (or Balance) | Remixes motifs from all seven axes with one readable primary weakness. The final boss's phases are the premium art/audio moment and award a capstone high-rarity pet/gear choice. |

### 3.3 Post-Island-10 3D unlock and presentation toggle

When **each member** reaches Island 11 after the Island 10 boss, show that member a one-time, dismissible welcome dialog with this exact headline:

> **Congrats, welcome to the world of pets in 3D.**

Offer **Explore 3D** and **Stay in 2D for now**. It celebrates the new chapter; it is not a route gate, needs no purchase, resets nothing, and does not imply 2D is worse. If dismissed, the choice stays in Settings and at the next eligible battle. "Seen" and the chosen mode are **member-scoped**: one partner's choice never consumes or overrides the other's. Persist it across that member's devices where their account supports it.

After the unlock, show a persistent, accessible **2D / 3D** toggle for all future battles (including replays), plus the same setting in Settings. Switching applies to the **next** encounter, never one in progress; the mode is announced and has a text label, not a tiny unlabeled icon. Both modes use the exact same enemy stats, seed, actions, rewards, hitboxes/target sizes and win/loss rules.

3D scope: island dioramas/boards, pet/companion models, bosses and enemies, battle staging, and input-control artwork. Keep HeartBeat's warm, crafted illustration style and the seven elements, translated into the same material language, silhouettes and semantic cues — no palette change. Art direction: **expressive, emotional animation in a miniature diorama**. Pet reactions tender and playful (curiosity, pride, comfort, surprise, affection); boards feel like handcrafted stages; larger cinematic entrances, lighting and phase reveals are for bosses. Controls stay accessible DOM overlays, never text baked into a canvas. 3D is a presentation layer over the same reducer.

Budget and devices: prototype one board, one pet, one common enemy and one boss; profile on real iPhones before authoring ten islands. Load WebGL and compressed assets lazily only after 3D is chosen; instancing, reused rigs, LOD, modest draw calls; an immediate 2D fallback for no WebGL, memory pressure, slow frames, offline/missing assets, or preference. Honour Reduce Motion/calm (no forced camera sweeps, shake or parallax) and keep the battle log, telegraph and HP in screen-reader text.

### 3.4 Partner play: celebrated, never required

Design for couples in one room **and** partners in different places joining through the same authenticated server. No same-Wi-Fi requirement, no real-time simultaneity for island progress, no partner response needed to clear an island, no stranger matchmaking.

Invite through gentle, skippable moments: "Want to explore this island together?", shared pet reactions, opt-in coordinated boss tactics, a remote-ready indicator. Always offer **Continue solo**, "invite later" and dismissal without penalty. Solo and duo get equivalent core progression and the same islands; co-op may add celebration, cosmetics, narrative beats or a modest bonus, never power needed to win, harder mandatory difficulty, or lost progress for a missed invite.

For co-op bosses, prioritise **synchronised boss moments and pet reactions**: shared phase entrances, readable "both acted" beats, companion-to-companion reactions, boss stagger, and a joint victory. Synchronise from the server's event/turn sequence so local and long-distance partners see the same event despite latency; if one disconnects or acts later, the other continues and the absent partner catches up without losing progress.

Add **exactly one compact partner-progress row inside the existing raid-sheet card** — no new page, feed or section. Show both sides at a glance (e.g. "You: Island 12 · Stage 4 | Partner: Island 11 · Stage 6") with a subtle last-updated cue; more detail behind a tap. Names and status screen-reader readable, meaningful updates announced politely (not every network tick), each member's visual mode and reduced motion honoured independently. Use the existing shared-service architecture where it fits; scope any new multiplayer protocol separately.

### 3.5 Bootstrap-production rule of thumb

One consistent 3D island kit: a hero environment, a small set of modular board pieces, reusable rig families, expressive pet animation sets, and distinct boss silhouettes/phases. Not every encounter gets a bespoke scene. Spend the art budget on the post-10 welcome reveal, island transitions, a few signature pets and the ten bosses; let lighting, materials, framing, animation timing and authored behaviour give reused assets their identity. Support sound-off play and reduced motion from the same storyboard.

## 4. iOS/PWA accessibility and design scan

A web app should not claim native HIG compliance by appearance alone. Apple's guidance is the design reference; WCAG 2.2 AA is the web acceptance baseline.

### Preserve

- Tested theme tokens and dynamic-scene scrims (the veil tests check text against worst-case garden paints across themes/modes).
- Both the app's calm switch and `prefers-reduced-motion`; battle timing already collapses to zero in calm mode.
- Safe-area spacing, keyboard-aware tab-bar hiding, and visible text labels in the bottom navigation.
- A non-colour cue for active navigation state.
- Strong semantics and axe checks in the visual walk; expand coverage rather than replacing it.

### Close the remaining verification gaps

1. **Dynamic text/zoom:** test iOS Safari zoom/text enlargement through 200% and iOS Larger Text. Check cards, settings rows, combat actions, island names, toasts/dialogs and the six-tab bar at 320 CSS px and in landscape. No clipped labels or horizontal page scroll; add a secondary navigation surface if the bar cannot stay legible at larger text.
2. **Touch targets:** Apple's usual target is 44×44 pt; WCAG 2.2 AA's minimum is 24×24 CSS px with exceptions. Adopt **44×44 CSS px as the preferred minimum for primary controls**. Justify any exception against the WCAG exception and mitigate with spacing. Measure the tab links' full clickable box at narrow widths, not only the 46×30 px glyph pill.
3. **VoiceOver:** traverse onboarding, bottom navigation, forms, island selection, combat, the result dialog and settings. Check names, roles, values, selected/disabled state, focus order, and an announced text summary of HP changes and turn results. The visual scene must never be the only source; keep a readable combat log.
4. **Keyboard and focus:** every action reachable, focus visible on every theme, dialogs trap and restore focus, no animation intercepts keyboard users.
5. **Colour and state:** keep AA contrast (4.5:1 normal text; 3:1 large text and relevant non-text UI). Never use element colour alone for weakness, status, selection or danger. Recheck translucent materials against live backdrops.
6. **Motion, flashes, haptics, audio:** reduced motion removes or replaces parallax, shake, zoom, pulsing and screen transitions, not merely shortens them. No rapid flashing. Haptics and audio are supplemental, user-controllable, and never the only alert.
7. **PWA/iOS behaviour:** test installed Home Screen mode and Safari separately: notches, software keyboard, viewport resizing, orientation, fixed navigation during scroll, offline launch/update recovery, external links, persistence after app switching. Include a small iPhone and a larger iPhone/iPad.
8. **Accessible copy:** short, literal labels for high-stakes logging and combat buttons; distinguish "locked" from "unavailable"; say what is saved/synced before actions that change shared data. Keep the gentle, non-punitive voice in failure and empty states.

### Visual direction: "premium, calm, legible"

- One stable type scale and strong hierarchy; decorative display faces only for short titles.
- Keep the existing colour system (accepted; no palette redesign): a limited surface ladder, one accent per theme, semantic status tokens, contrast held in both modes and when blur is unsupported.
- Tab labels readable at large text sizes; never rely on truncated labels.
- Generous spacing and predictable alignment; sticky/fixed UI only where it survives keyboard and safe-area tests.
- Art carries atmosphere, not state. Turn, telegraph, HP, weakness and result stay readable without animation, audio or colour perception.

## 5. Broader app-level product risks and opportunities

Validate which remain open before scheduling work:

| Priority | Area | Finding / next action |
| --- | --- | --- |
| P0 | Encounter beatability | Evaluator built (§2.4). Next: forecast screen, then authored assist variants. |
| P0 | Islands 11–20 scope | Keep cap 50; horizontal postgame; extend both runtime data surfaces and mirrors. Rarity/pet rewards never required to win. |
| P0 | 3D chapter reveal | Per-member one-time prompt and 2D/3D preference; equivalent gameplay; accessible low-memory 2D fallback. |
| P1 | Partner participation | Local and cross-distance play through the shared server; synchronised boss/pet moments; one compact raid-progress row; solo progress never reduced. |
| P1 | Accessibility validation | Keep axe and contrast tests; add manual iOS VoiceOver/zoom/device acceptance; 44×44 CSS px for primary controls; automate stable checks for target size, focus visibility and reflow. |
| P1 | Visual regression | Pixel baselines are not armed until real CI artifacts are captured and required. Use actual CI screenshots, never local ones. |
| P1 | Progress recovery | Some older quests/achievements may stay device-local and not return after device loss. Confirm the contract; align messaging or add sync as a separately scoped change. |
| P1 | User data portability | No self-service export. A small, privacy-conscious export would strengthen the recovery story. |
| P2 | UX coherence | Recheck settings/onboarding/error states and empty/loading/offline states for one accessible voice and screen-reader updates. Prefer refinements to new currencies or parallel systems. |
| P2 | Performance | Revalidate cold launch and WASM loading on real iPhones (the 3.5 MB runtime). Keep "gate first, boot WASM only when entering the garden". |

## 6. Validation

**Original scan (2026-10-12, a container without .NET):** TypeScript typecheck passed; app unit suite passed (181 files / 3,108 tests); Worker boss formula tests passed (12). The full Worker suite had 16 holdings failures (`column index out of range`) on Node 22.13.0, below the locked packages' Node 22.19+ engine range — reproduce on CI's runtime before treating that as a product defect. C# was not run.

**Evaluator PR (2026-10-13, .NET 10 present):** `npm run game:test` passes 675 tests (509 before, all unchanged after `Sim` began calling `Forecast.Play`). Core builds clean in Release with warnings as errors.

## 7. Decisions reflected in this spec

- "Easier" means a **player-specific beatability evaluator**, not a blanket damage-curve reduction.
- Combat level cap is **50**; levels beyond 46 are rebalanced around late-game gear and pet rewards, not ten more vertical stat bands.
- Islands 11–20 are a **3D miniature-diorama chapter after Island 10**, with the exact congratulatory headline. Each member sees it on reaching Island 11 and chooses 2D/3D independently.
- The rarity ladder ends at **Mythic**. High-rarity gear and pets feel special through items, identity, effects and presentation.
- A qualitative **pre-fight forecast with a "Why?"** and an opt-in assist before the fight; no undisclosed mid-fight adjustment.
- Partner play is **encouraged, never required**; local and cross-distance play; synchronised boss/pet moments; exactly one partner-progress row in the raid-sheet card.
- Pet emotion tender/playful in miniature dioramas; cinematic scale for bosses.
- Current colours stay; **44×44 CSS px preferred minimums for primary controls**.

### Next review focus

Validate the forecast wording and "Why?" against the sample table in §2.4, then prototype the single raid-card row and one synchronised diorama boss/pet moment. Keep those narrow before expanding to all ten islands.

## References

- Apple, [Human Interface Guidelines: Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- Apple, [Human Interface Guidelines: Typography](https://developer.apple.com/design/human-interface-guidelines/typography)
- W3C, [Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG22/)
- W3C, [Understanding Success Criterion 2.5.8: Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- W3C, [Mobile Accessibility](https://www.w3.org/TR/wcag2mobile-22/)
