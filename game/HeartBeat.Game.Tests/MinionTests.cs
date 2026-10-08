using System.Text.RegularExpressions;
using HeartBeat.Game.Core;
using HeartBeat.Game.Core.Data;
using HeartBeat.Game.Core.Models;

namespace HeartBeat.Game.Tests;

/// <summary>
/// The skirmishes on islands 5 and up: small, optional, and never in the way.
/// </summary>
public class MinionTests
{
    public static TheoryData<int, int> EveryMinion()
    {
        var data = new TheoryData<int, int>();
        for (int island = Minions.FirstIsland; island <= World.IslandCount; island++)
        for (int k = 1; k <= Minions.PerIsland; k++)
            data.Add(island, Minions.StageBase + k);
        return data;
    }

    [Theory]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(3)]
    [InlineData(4)]
    public void IslandsOneToFourHaveNone(int island)
    {
        for (int k = 1; k <= Minions.PerIsland; k++)
            Assert.Null(World.MonsterAt(island, Minions.StageBase + k, DioramaTheme.Light));
    }

    [Theory]
    [MemberData(nameof(EveryMinion))]
    public void IsASmallerCopyOfTheStageItFollows(int island, int stage)
    {
        Monster mini = World.MonsterAt(island, stage, DioramaTheme.Light)!;
        Monster parent = World.StageFor(island, Minions.IndexOf(stage))!.Monster;

        Assert.Equal(MonsterType.Minion, mini.Type);
        Assert.True(mini.Hp < parent.Hp / 2, $"{mini.Name} is not much smaller than {parent.Name}");
        Assert.True(mini.Attack < parent.Attack);
        Assert.Equal(parent.SpriteKey, mini.SpriteKey);
        Assert.Equal(parent.Weakness, mini.Weakness);
        Assert.StartsWith("Little ", mini.Name);
    }

    /// <summary>The TypeScript side reads progress off ids shaped like i5s3-, so a skirmish must never wear one.</summary>
    [Theory]
    [MemberData(nameof(EveryMinion))]
    public void CannotBeMistakenForAStage(int island, int stage)
    {
        Monster mini = World.MonsterAt(island, stage, DioramaTheme.Light)!;
        Assert.DoesNotMatch(new Regex(@"^i\d+s\d+-"), mini.Id);
        Assert.StartsWith("m", mini.Id);
        Assert.Null(World.StageFor(island, stage));
    }

    [Fact]
    public void IdsAreUniqueAcrossTheWorld()
    {
        var ids = new List<string>();
        foreach (Island island in World.Islands)
            foreach (Stage s in island.Stages) ids.Add(s.Monster.Id);
        for (int island = Minions.FirstIsland; island <= World.IslandCount; island++)
        for (int k = 1; k <= Minions.PerIsland; k++)
            ids.Add(World.MonsterAt(island, Minions.StageBase + k, DioramaTheme.Light)!.Id);
        Assert.Equal(ids.Count, ids.Distinct().Count());
    }

    /// <summary>Uncharged and ungeared, at the level the stage it follows is entered at: every fight stays winnable.</summary>
    [Theory]
    [MemberData(nameof(EveryMinion))]
    public void IsWinnableWithNoChargesAndNoGear(int island, int stage)
    {
        int level = IslandTests.ArrivalLevel(island, Minions.IndexOf(stage));
        Monster mini = World.MonsterAt(island, stage, DioramaTheme.Light)!;
        double rate = Sim.WinRate(mini, level);
        Assert.True(rate >= 0.95, $"{mini.Name} (island {island}) wins only {rate:P0} at level {level}");
    }

    [Theory]
    [MemberData(nameof(EveryMinion))]
    public void TheDarkFaceIsTougherAndStillBeatable(int island, int stage)
    {
        Monster light = World.MonsterAt(island, stage, DioramaTheme.Light)!;
        Monster dark = World.MonsterAt(island, stage, DioramaTheme.Dark)!;
        Assert.True(dark.Hp > light.Hp);
        Assert.Equal(light.Speed, dark.Speed);
        Assert.StartsWith("Little ", dark.Name);
        int level = Math.Min(Progression.MaxLevel, IslandTests.ArrivalLevel(island, Minions.IndexOf(stage)) + 1);
        Assert.True(Sim.WinRate(dark, level) >= 0.9);
    }

    [Fact]
    public void PaysLessThanAnythingThatIsAStage()
    {
        int mini = Progression.XpForDefeating(MonsterType.Minion);
        Assert.True(mini > 0);
        Assert.True(mini < Progression.XpForDefeating(MonsterType.Common));
    }

    [Fact]
    public void TheApiServesAndFightsThem()
    {
        Assert.NotNull(Api.Stage(5, Minions.StageBase + 1, "light"));
        Assert.NotNull(Api.BeginBattle(5, Minions.StageBase + 1, "light", level: 17, seed: 1));
        Assert.Null(Api.Stage(2, Minions.StageBase + 1, "light"));
        Assert.Null(Api.Stage(5, Minions.StageBase + 3, "light"));
        Assert.Equal(Progression.XpForDefeating(MonsterType.Minion), Api.DefeatXp(5, Minions.StageBase + 2));
    }
}
