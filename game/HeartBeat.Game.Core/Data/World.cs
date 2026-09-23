using HeartBeat.Game.Core.Models;

namespace HeartBeat.Game.Core.Data;

/// <summary>
/// The world: seven islands of seven stages, every one of them built.
///
/// Each island is one file in <c>Data/</c> and one line in <see cref="Islands"/>.
/// <see cref="StageFor"/> returning null is still the whole of the "no such
/// stage" handling, which the TypeScript side reads as "locked".
/// </summary>
public static class World
{
    public const int IslandCount = 7;

    public static readonly IReadOnlyList<Island> Islands =
    [
        Island1.Value,
        Island2.Value,
        Island3.Value,
        Island4.Value,
        Island5.Value,
        Island6.Value,
        Island7.Value,
    ];

    /// <summary>
    /// Every island's dark names in one map. Monster ids carry their island
    /// (<c>i3s4-...</c>), so they are unique across the world and one map is
    /// enough - which is what keeps adding an island a file plus a line.
    /// </summary>
    private static readonly IReadOnlyDictionary<string, string> DarkNames =
        new[]
        {
            Island1.DarkNames, Island2.DarkNames, Island3.DarkNames, Island4.DarkNames,
            Island5.DarkNames, Island6.DarkNames, Island7.DarkNames,
        }
        .SelectMany(names => names)
        .ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.Ordinal);

    public static Island? IslandFor(int number) =>
        Islands.FirstOrDefault(i => i.Number == number);

    /// <summary>True once an island has stages authored for it.</summary>
    public static bool IsBuilt(int number) => IslandFor(number)?.Stages.Count > 0;

    /// <summary>
    /// The monster standing on one stage, already wearing the right face.
    ///
    /// Null for a stage that does not exist - an unbuilt island, or a stage
    /// number outside 1..7. Callers on the TypeScript side treat null as
    /// "locked", which is why this never throws.
    /// </summary>
    public static Monster? MonsterAt(int island, int stage, DioramaTheme theme)
    {
        Stage? found = StageFor(island, stage);
        if (found is null) return null;

        string? darkName = DarkNames.TryGetValue(found.Monster.Id, out string? n) ? n : null;
        return found.Monster.Forged(theme, darkName);
    }

    public static Stage? StageFor(int island, int stage)
    {
        Island? found = IslandFor(island);
        if (found is null) return null;
        return found.Stages.FirstOrDefault(s => s.Number == stage);
    }

    /// <summary>
    /// The stage a player who has cleared <paramref name="clearedStages"/> is
    /// standing on, clamped to the island's last stage once it is finished.
    /// </summary>
    public static int CurrentStage(int clearedStages) =>
        Math.Clamp(clearedStages + 1, 1, Island.StagesPerIsland);

    /// <summary>How far through an island a clear count is, in [0, 1]. What the compass bar shows.</summary>
    public static double Progress(int clearedStages) =>
        Math.Clamp(clearedStages / (double)Island.StagesPerIsland, 0, 1);
}
