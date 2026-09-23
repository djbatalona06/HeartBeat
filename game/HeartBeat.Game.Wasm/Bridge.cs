using System.Runtime.InteropServices.JavaScript;
using System.Runtime.Versioning;
using HeartBeat.Game.Core;

namespace HeartBeat.Game.Wasm;

/// <summary>
/// The whole JS boundary, and deliberately the whole of this project.
///
/// Every method is a one-line delegate to <see cref="Api"/>. No rule, table or
/// formula lives in this file, and that is the point: <c>dotnet test</c> cannot
/// reach a browser-wasm assembly, so the part that cannot be tested is kept too
/// small to hold a bug. Everything these methods forward to is covered by
/// <c>ApiTests</c>.
///
/// Strings in, strings out. The alternative - marshalling object graphs across
/// the boundary - costs a generated shim per type and buys nothing here, since
/// the worker hands the JSON straight to structuredClone anyway.
/// </summary>
[SupportedOSPlatform("browser")]
public static partial class Bridge
{
    /// <summary>
    /// The build gate, and the worker's readiness check. If this round-trips,
    /// the runtime booted and the interop layer is wired - see <c>init</c> in
    /// game.worker.ts.
    /// </summary>
    [JSExport]
    internal static int Ping(int value) => value + 1;

    /// <summary>The seven islands, for the compass and the world map.</summary>
    [JSExport]
    internal static string World() => Api.World();

    /// <summary>One stage and its monster, or null if that stage does not exist.</summary>
    [JSExport]
    internal static string? Stage(int island, int stage, string theme) => Api.Stage(island, stage, theme);

    /// <summary>Opens a fight, or null if there is nothing on that stage.</summary>
    [JSExport]
    internal static string? BeginBattle(
        int island, int stage, string theme, int level, double seed, string charges, string statsJson) =>
        Api.BeginBattle(island, stage, theme, level, seed, charges, statsJson);

    /// <summary>The player's turn. Returns the next state, or null if the state was malformed.</summary>
    [JSExport]
    internal static string? Act(string battleJson, string actionId) => Api.Act(battleJson, actionId);

    /// <summary>The monster's turn, kept separate so the overlay can animate between the two.</summary>
    [JSExport]
    internal static string? MonsterMove(string battleJson) => Api.MonsterMove(battleJson);

    /// <summary>Level, stats and unlocked actions for a total XP figure.</summary>
    [JSExport]
    internal static string Progress(int xp) => Api.Progress(xp);

    /// <summary>What logging a wellness activity is worth, and whether it crossed a level.</summary>
    [JSExport]
    internal static string Award(string activity, int currentXp) => Api.Award(activity, currentXp);

    /// <summary>What beating a stage's monster is worth.</summary>
    [JSExport]
    internal static int DefeatXp(int island, int stage) => Api.DefeatXp(island, stage);
}
