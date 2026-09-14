# game/ — the C# half of Eve's Garden

Three projects, and the split between them is the whole design:

| Project | Target | What it is |
|---|---|---|
| `HeartBeat.Game.Core` | `net10.0` | All the logic. Pure C#, no browser types, no JS interop. |
| `HeartBeat.Game.Wasm` | `net10.0-browser` | A thin `[JSExport]` shim. JSON in, JSON out. No logic. |
| `HeartBeat.Game.Tests` | `net10.0` | xunit over Core. Runs on plain `dotnet test`, no browser. |

Core is a normal class library on purpose. Test runners under `browser-wasm` are
a world of pain, and none of this logic needs a browser to be correct — so the
logic lives where `dotnet test` can reach it and the wasm project stays too small
to hold a bug.

## Build

```bash
dotnet build game/HeartBeat.Game.sln -c Release
dotnet test  game/HeartBeat.Game.sln
```

The app's Vite build invokes the Wasm project itself via `unplugin-dotnet-wasm`;
see `app/vite.config.ts`.

## Regenerating the TypeScript parity fixtures

`RngTests` pins the C# port of `app/src/domain/hash.ts` against values produced
by the TypeScript original. If `hash.ts` ever changes, regenerate them with:

```bash
node -e "
function hash(t){let h=2166136261;for(let i=0;i<t.length;i+=1){h^=t.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function roll(s,p){let h=(s^Math.imul(p+1,2654435761))>>>0;h=Math.imul(h^(h>>>15),2246822507)>>>0;h=Math.imul(h^(h>>>13),3266489909)>>>0;return ((h^(h>>>16))>>>0)/4294967296;}
for (const w of ['','a','sloth-sprout']) console.log(JSON.stringify(w), hash(w));
for (const s of [0,1,12345]) for (const p of [0,1,2,7,100]) console.log(s, p, roll(s,p).toFixed(17));
"
```

A failure there means the two languages have stopped agreeing about a fight, not
that the test is stale — check which side moved before editing the numbers.

## Size

The published runtime is about **3.5 MB raw / 1.04 MB brotli**. That is larger
than the whole rest of the app's service-worker precache, which is why
`app/vite.config.ts` keeps it *out* of the precache: Eve's Garden needs one
online visit before it works offline, exactly like the Phaser overworld.
