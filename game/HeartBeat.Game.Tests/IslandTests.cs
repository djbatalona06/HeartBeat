using HeartBeat.Game.Core;
using HeartBeat.Game.Core.Data;
using HeartBeat.Game.Core.Models;

namespace HeartBeat.Game.Tests;

/// <summary>
/// Balance, pinned by simulation rather than by eye.
///
/// These are the tests that stop Island 1 from shipping with a wall in it. They
/// play real fights across many seeds and assert on win *rates*, because a
/// single fight proves nothing about a seeded game.
/// </summary>
public class IslandTests
{
    /// <summary>The rank an island is balanced to be entered at.</summary>
    public static int BandStart(int island) => 1 + 4 * (island - 1);

    /// <summary>The rank a couple arrives at a stage with: one per stage past the band start.</summary>
    public static int ArrivalLevel(int island, int stage) => Math.Min(Progression.MaxLevel, BandStart(island) + stage);

    public static TheoryData<int> IslandNumbers()
    {
        var data = new TheoryData<int>();
        foreach (Island i in World.Islands) data.Add(i.Number);
        return data;
    }

    public static TheoryData<int, int> EveryStage()
    {
        var data = new TheoryData<int, int>();
        foreach (Island i in World.Islands)
        foreach (Stage s in i.Stages)
            data.Add(i.Number, s.Number);
        return data;
    }

    [Theory]
    [MemberData(nameof(IslandNumbers))]
    public void EveryIslandHasSevenStagesNumberedInOrder(int number)
    {
        Island island = World.IslandFor(number)!;
        Assert.Equal(Island.StagesPerIsland, island.Stages.Count);
        Assert.Equal(Enumerable.Range(1, Island.StagesPerIsland), island.Stages.Select(s => s.Number));
    }

    [Theory]
    [MemberData(nameof(IslandNumbers))]
    public void TheStageShapeIsCommonCommonCommonSemiBossCommonEliteBoss(int number)
    {
        Assert.Equal(
            new[]
            {
                MonsterType.Common, MonsterType.Common, MonsterType.Common,
                MonsterType.SemiBoss, MonsterType.Common, MonsterType.Elite, MonsterType.Boss,
            },
            World.IslandFor(number)!.Stages.Select(s => s.Monster.Type));
    }

    [Theory]
    [MemberData(nameof(IslandNumbers))]
    public void EveryMonsterIsWeakToItsIslandElement(int number)
    {
        // The rule that makes the world legible: if you are stuck on Morning
        // Meadow, move. Breaking it would make an island unreadable.
        Island island = World.IslandFor(number)!;
        foreach (Stage stage in island.Stages)
        {
            Assert.Equal(island.Element, stage.Monster.Weakness);
            Assert.NotEqual(stage.Monster.Weakness, stage.Monster.Strength);
        }
    }

    [Fact]
    public void MonsterIdsAndSpritesAreUniqueAcrossTheWorld()
    {
        var monsters = World.Islands.SelectMany(i => i.Stages).Select(s => s.Monster).ToList();
        Assert.Equal(monsters.Count, monsters.Select(m => m.Id).Distinct(StringComparer.Ordinal).Count());
        Assert.Equal(monsters.Count, monsters.Select(m => m.SpriteKey).Distinct(StringComparer.Ordinal).Count());
        foreach (Island island in World.Islands)
        foreach (Stage stage in island.Stages)
        {
            Assert.StartsWith($"i{island.Number}s{stage.Number}-", stage.Monster.Id, StringComparison.Ordinal);
            Assert.False(string.IsNullOrWhiteSpace(stage.Monster.SpriteKey));
            Assert.NotEmpty(stage.Monster.Actions);
        }
    }

    [Theory]
    [MemberData(nameof(IslandNumbers))]
    public void EveryStageHasADarkName(int number)
    {
        foreach (Stage stage in World.IslandFor(number)!.Stages)
        {
            Monster dark = World.MonsterAt(number, stage.Number, DioramaTheme.Dark)!;
            Assert.NotEqual(stage.Monster.Name, dark.Name);
        }
    }

    [Theory]
    [MemberData(nameof(IslandNumbers))]
    public void HealthRisesAcrossTheIsland(int number)
    {
        var hp = World.IslandFor(number)!.Stages.Select(s => s.Monster.Hp).ToList();
        Assert.True(hp.Take(3).Average() < hp.Skip(4).Average());
        Assert.True(hp[^1] == hp.Max(), "the boss should be the toughest thing on the island");
        Assert.True(hp[4] < hp[3], "stage 5 is meant to be a breather after the semi-boss");
    }

    [Theory]
    [MemberData(nameof(EveryStage))]
    public void EveryStageIsWinnableByTheTimeYouReachIt(int island, int stage)
    {
        // Uncharged and ungeared: the balanced baseline. If a stage cannot be
        // beaten at the level a player arrives with, the island has a wall in it.
        int level = ArrivalLevel(island, stage);
        Monster monster = World.MonsterAt(island, stage, DioramaTheme.Light)!;
        double rate = Sim.WinRate(monster, level);
        Assert.True(rate >= 0.8, $"island {island} stage {stage} ({monster.Name}) wins only {rate:P0} at level {level}");
    }

    [Theory]
    [MemberData(nameof(EveryStage))]
    public void TheDarkVariantIsHarderButStillBeatable(int island, int stage)
    {
        Monster light = World.MonsterAt(island, stage, DioramaTheme.Light)!;
        Monster dark = World.MonsterAt(island, stage, DioramaTheme.Dark)!;
        Assert.True(dark.Hp > light.Hp, $"{light.Name}'s dark variant is no tougher");
        Assert.Equal(light.Speed, dark.Speed);

        // The load-bearing half: a dark week is the worst possible moment to
        // make the game unwinnable.
        int level = Math.Min(Progression.MaxLevel, ArrivalLevel(island, stage) + 1);
        double rate = Sim.WinRate(dark, level);
        Assert.True(rate >= 0.7, $"dark island {island} stage {stage} wins only {rate:P0} at level {level}");
    }

    [Fact]
    public void StageOneIsWinnableOnDayOne()
    {
        // Level 1, no history. The first thing a new couple ever does must not be a loss.
        Monster sprout = World.MonsterAt(1, 1, DioramaTheme.Light)!;
        Assert.True(Sim.WinRate(sprout, 1) >= 0.95);
    }

    [Theory]
    [MemberData(nameof(IslandNumbers))]
    public void TheBossIsNotWinnableWhereTheIslandStarts(int island)
    {
        // The other half of balance: if the boss falls on arrival, the six
        // stages in front of it were pointless.
        Monster boss = World.MonsterAt(island, 7, DioramaTheme.Light)!;
        Assert.True(Sim.WinRate(boss, BandStart(island)) <= 0.05);
    }

    [Theory]
    [MemberData(nameof(IslandNumbers))]
    public void GearHelpsButDoesNotSkipAnIsland(int island)
    {
        // An endgame sheet - every stat past its half-point, which is more
        // than a full mythic set gives any one stat - still leaves the boss
        // out of reach on arrival.
        var maxed = new Boosts([], new RaidStats(100, 100, 100, 100, 100, 100, 100));
        Monster boss = World.MonsterAt(island, 7, DioramaTheme.Light)!;
        Assert.True(Sim.WinRate(boss, BandStart(island), maxed) <= 0.2);
    }

    [Theory]
    [MemberData(nameof(IslandNumbers))]
    public void LoggingTheIslandsOwnThingHelps(int island)
    {
        // The whole design in one assertion: the charge that hits the island's
        // element makes its boss easier one level early.
        Monster boss = World.MonsterAt(island, 7, DioramaTheme.Light)!;
        Charge answer = Enum.GetValues<Charge>().First(c => Charges.ElementOf(c) == World.IslandFor(island)!.Element);
        int level = ArrivalLevel(island, 7) - 1;
        double plain = Sim.WinRate(boss, level);
        double charged = Sim.WinRate(boss, level, new Boosts([answer], RaidStats.None));
        Assert.True(charged > plain || charged == 1, $"{answer} did not help on island {island} ({charged:P0} vs {plain:P0})");
    }

    [Fact]
    public void TheBossFallsToAPlayerWhoClearedTheIsland()
    {
        Monster boss = World.MonsterAt(1, 7, DioramaTheme.Light)!;
        Assert.True(Sim.WinRate(boss, 8) >= 0.8);
    }

    [Fact]
    public void DarkScalingIsAppliedExactlyOnce()
    {
        Monster light = World.MonsterAt(1, 1, DioramaTheme.Light)!;
        Monster dark = World.MonsterAt(1, 1, DioramaTheme.Dark)!;
        Assert.Equal((int)Math.Round(light.Hp * Monster.DarkScale, MidpointRounding.AwayFromZero), dark.Hp);

        // The invariant that matters is that the scale cannot compound. Forging
        // a dark monster dark again is a no-op, so a caller that resolves a
        // variant twice gets the monster that was authored, not a third one
        // nobody balanced. (Forging back to light is deliberately NOT an
        // inverse - the scaled stats are not un-scaled - which is why nothing
        // outside Data/ ever holds a dark monster and re-forges it.)
        Assert.Equal(dark.Hp, dark.Forged(DioramaTheme.Dark).Hp);
        Assert.Equal(dark, dark.Forged(DioramaTheme.Dark));
    }

    [Fact]
    public void EveryIslandIsBuilt()
    {
        Assert.Equal(World.IslandCount, World.Islands.Count);
        for (int n = 1; n <= World.IslandCount; n++) Assert.True(World.IsBuilt(n));
        Assert.Null(World.MonsterAt(World.IslandCount + 1, 1, DioramaTheme.Light));
    }

    [Fact]
    public void EveryIslandHasItsOwnElement()
    {
        var elements = World.Islands.Select(i => i.Element).ToList();
        Assert.Equal(elements.Count, elements.Distinct().Count());
    }

    [Fact]
    public void LookingUpAStageThatDoesNotExistReturnsNullRatherThanThrowing()
    {
        Assert.Null(World.MonsterAt(1, 0, DioramaTheme.Light));
        Assert.Null(World.MonsterAt(1, 8, DioramaTheme.Light));
        Assert.Null(World.MonsterAt(99, 1, DioramaTheme.Light));
        Assert.Null(World.StageFor(1, -5));
    }

    [Theory]
    [InlineData(0, 1)]
    [InlineData(3, 4)]
    [InlineData(6, 7)]
    [InlineData(7, 7)]
    [InlineData(99, 7)]
    public void CurrentStageClampsToTheIsland(int cleared, int expected) =>
        Assert.Equal(expected, World.CurrentStage(cleared));

    [Fact]
    public void ProgressSpansZeroToOne()
    {
        Assert.Equal(0, World.Progress(0));
        Assert.Equal(1, World.Progress(Island.StagesPerIsland));
        Assert.Equal(1, World.Progress(99));
        Assert.InRange(World.Progress(3), 0.4, 0.5);
    }
}
