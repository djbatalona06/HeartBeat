using HeartBeat.Game.Core.Models;

namespace HeartBeat.Game.Core.Data;

/// <summary>
/// The world: five islands of seven stages, of which one is built.
///
/// Islands 2-5 are named here and have no stages yet. That is on purpose and it
/// is visible rather than hidden: the compass and the world map read
/// <see cref="Islands"/>, so an unbuilt island renders as locked with a real
/// name instead of a gap, and shipping island 2 is a single file in
/// <c>Data/</c> plus one line here. <see cref="StageFor"/> returning null is
/// the whole of the "not built yet" handling.
/// </summary>
public static class World
{
    public const int IslandCount = 5;

    private static Island Planned(int number, string light, string dark, Element element) =>
        new(number, light, dark, element, []);

    public static readonly IReadOnlyList<Island> Islands =
    [
        Island1.Value,
        Planned(2, "Kitchen Grove", "Craving Cavern", Element.Nourishment),
        Planned(3, "Focus Falls", "Fog Marsh", Element.Focus),
        Planned(4, "Joy Ridge", "Isolation Peak", Element.Mood),
        Planned(5, "Rest Haven", "Burnout Abyss", Element.Rest),
    ];

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

        string? darkName = island == 1 && Island1.DarkNames.TryGetValue(found.Monster.Id, out string? n) ? n : null;
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
