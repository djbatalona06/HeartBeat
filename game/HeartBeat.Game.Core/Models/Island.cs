namespace HeartBeat.Game.Core.Models;

/// <summary>
/// One stage of an island: a monster, and what the compass calls it.
/// </summary>
public sealed record Stage(int Number, string Name, Monster Monster);

/// <summary>
/// One island. Seven stages, two faces, one wellness axis.
///
/// <paramref name="Element"/> is the axis the island is *about*, and by
/// construction every monster on it is weak to that element. That invariant is
/// pinned by <c>IslandTests.EveryMonsterIsWeakToItsIslandElement</c>, because it
/// is the rule that makes the world legible: if you are stuck on Morning
/// Meadow, move.
/// </summary>
public sealed record Island(
    int Number,
    string LightName,
    string DarkName,
    Element Element,
    IReadOnlyList<Stage> Stages)
{
    public const int StagesPerIsland = 7;

    public string NameFor(DioramaTheme theme) => theme == DioramaTheme.Dark ? DarkName : LightName;
}
