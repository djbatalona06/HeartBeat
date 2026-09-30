# 03 · App Flow

Only two flows change. Everything else keeps its current route and behaviour.

## Flow 1 — A fight round (Phases B and C)

Entry: Raid Gate (pick a companion) → garden → walk into a monster → fight opens.
The page owns the fight (React owns the wasm worker); the scene is told what to draw.

```
Player taps a move in ActionBar
  → game.playerMove()                        (C# prices the turn; returns BattleDto)
  → move = moveKeyFor(action.style)          physical | defensive | magic | mend
  → fireSkill(kit, move, context)            may add the companion's signature/support skill
      if fires: setFlourish(name); scene.skill(vfx)           ← already shipped
  → scene.strike('player-hits', edge,
                 { move, kit: kit.themeId })                  ← Phase C: was (blow, edge) only
  → battle log line + live region: "<Move name> — <effect>, <weak|plain|strong> hit"
  → if monster still standing: TURN_GAP_MS → game.monsterMove()
  → scene.strike('monster-hits', 'plain')
  → outcome != Fighting → finish(): victory banner / defeat / withdraw
```

Code: `features/eve-garden/EveGardenPage.tsx` (~lines 545–590: skill at 563, strike at
568, monster at 582), `scene/BattleGardenScene.ts` (`strike` ~255, `skill` ~309),
`scene/events.ts` (`SceneHandle`), `scene/game.ts:80`.

**Calm path (Phase B):** `calm` (from `useTheme()`, `EveGardenPage.tsx:121`) or
`prefers-reduced-motion` ⇒ `strikePlan` returns zeros ⇒ `strike`/`skill` resolve after
one still frame, no tween, no delay. The log line and live-region text are identical.

**Edge cases:** a move with no mapped effect falls back to `FALLBACK_SHAPE = 'burst'`
(existing). `mend` is not one of the 15 (it is a heal, not an attack) and keeps the
`motes` shape. Backgrounding mid-fight uses the existing `pause()`/`resume()`.
A fight must never depend on animation completing to advance.

## Flow 2 — A level-up (Phase E)

Level-up is **derived on Home** and is already built; Phase E extends it.

```
Home mounts / pet XP changes
  → level = levelProgress(pet.xp).level           (pet's 50-rung curve, not combat rank)
  → seen  = localStorage hb.petLevelSeen          (null ⇒ record, play nothing)
  → levelUpSince(seen, level) → level | null
  → crossed = milestonesAt(l) for every l in (seen, level]          ← Phase E
  → plan = levelUpPlan({ calm, big: crossed.length > 0 })            ← big for EVERY kind
  → animator.run()  (hop + glow + bar sweep)  then the greeting pose
  → reveal line: "<milestone.name> — <milestone.blurb>"  via the toast host   ← Phase E
```

Both phones get this independently because the level derives from the shared pet.
Several levels at once ⇒ one animation ending on the final level, and the reveal
lists what opened (cap the visible lines, announce all).
**Calm:** no motion; the reveal line and the updated `Lv N` still appear.
**Sound:** only for a level-up seen live while Home is open (existing rule).

## Flow 3 — Quiz question (Phase A)

```
Question shown → clock = start(now)
visibilitychange: hidden → pause(clock, now); visible → resume(clock, now)
tick (only while visible): elapsed(clock, now) → countdown / score
```
`pause` on a paused clock and `resume` on a running one are no-ops; `elapsed` is
monotonic. Resuming continues the question; it does not restart it.
Code: `features/study/StudyPage.tsx:453` (the bare `setInterval(..., 200)`; `plan.md` and `CURRENT_STATE.md` still say :457, which has drifted).
