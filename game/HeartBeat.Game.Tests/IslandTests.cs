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
    public static TheoryData<int> StageNumbers()
    {
        var data = new TheoryData<int>();
        foreach (Stage s in Island1.Value.Stages) data.Add(s.Number);
        return data;
    }

    [Fact]
    public void IslandOneHasSevenStagesNumberedInOrder()
    {
        Assert.Equal(Island.StagesPerIsland, Island1.Value.Stages.Count);
        Assert.Equal(
            Enumerable.Range(1, Island.StagesPerIsland),
            Island1.Value.Stages.Select(s => s.Number));
    }

    [Fact]
    public void TheStageShapeIsCommonCommonCommonSemiBossCommonEliteBoss()
    {
        Assert.Equal(
            new[]
            {
                MonsterType.Common, MonsterType.Common, MonsterType.Common,
                MonsterType.SemiBoss, MonsterType.Common, MonsterType.Elite, MonsterType.Boss,
            },
            Island1.Value.Stages.Select(s => s.Monster.Type));
    }

    [Fact]
    public void EveryMonsterIsWeakToItsIslandElement()
    {
        // The rule that makes the world legible: if you are stuck on Morning
        // Meadow, move. Breaking it would make an island unreadable.
        foreach (Stage stage in Island1.Value.Stages)
        {
            Assert.Equal(Island1.Value.Element, stage.Monster.Weakness);
        }
    }

    [Fact]
    public void NoMonsterIsBothWeakAndStrongToTheSameElement()
    {
        foreach (Stage stage in Island1.Value.Stages)
        {
            Assert.NotEqual(stage.Monster.Weakness, stage.Monster.Strength);
        }
    }

    [Fact]
    public void MonsterIdsAreUniqueAcrossTheIsland()
    {
        var ids = Island1.Value.Stages.Select(s => s.Monster.Id).ToList();
        Assert.Equal(ids.Count, ids.Distinct(StringComparer.Ordinal).Count());
    }

    [Fact]
    public void EveryMonsterHasASpriteAndAtLeastOneAction()
    {
        foreach (Stage stage in Island1.Value.Stages)
        {
            Assert.False(string.IsNullOrWhiteSpace(stage.Monster.SpriteKey));
            Assert.NotEmpty(stage.Monster.Actions);
            // Something has to be able to reduce the player's HP, or the fight
            // is unloseable and the stage is decoration.
            Assert.Contains(stage.Monster.Actions, a => a.Type is ActionType.Attack);
        }
    }

    [Fact]
    public void EveryStageHasADarkName()
    {
        foreach (Stage stage in Island1.Value.Stages)
        {
            Assert.True(
                Island1.DarkNames.ContainsKey(stage.Monster.Id),
                $"{stage.Monster.Id} has no dark-variant name");
        }
    }

    [Fact]
    public void HealthRisesAcrossTheIsland()
    {
        // Not strictly monotonic - stage 5 is the deliberate recovery stage -
        // so the assertion is that the back half is harder than the front half.
        var hp = Island1.Value.Stages.Select(s => s.Monster.Hp).ToList();
        Assert.True(hp.Take(3).Average() < hp.Skip(4).Average());
        Assert.True(hp[^1] == hp.Max(), "the boss should be the toughest thing on the island");
        Assert.True(hp[4] < hp[3], "stage 5 is meant to be a breather after the semi-boss");
    }

    [Theory]
    [MemberData(nameof(StageNumbers))]
    public void EveryStageIsWinnableByTheTimeYouReachIt(int stageNumber)
    {
        // The intended level curve: roughly one level per stage, capped. If a
        // stage cannot be beaten at the level a player arrives with, the island
        // has a wall in it.
        int level = Math.Min(Progression.MaxLevel, stageNumber + 1);
        Monster monster = World.MonsterAt(1, stageNumber, DioramaTheme.Light)!;
        double rate = Sim.WinRate(monster, level);
        Assert.True(rate >= 0.8, $"stage {stageNumber} ({monster.Name}) wins only {rate:P0} at level {level}");
    }

    [Fact]
    public void StageOneIsWinnableOnDayOne()
    {
        // Level 1, one action unlocked, no history. This is the first thing a
        // new couple ever does, and it must not be a loss.
        Monster sprout = World.MonsterAt(1, 1, DioramaTheme.Light)!;
        Assert.True(Sim.WinRate(sprout, 1) >= 0.95);
    }

    [Fact]
    public void TheBossIsNotWinnableAtLevelOne()
    {
        // The other half of balance: if the boss falls to a level-1 player, the
        // six stages in front of it were pointless.
        Monster boss = World.MonsterAt(1, 7, DioramaTheme.Light)!;
        Assert.True(Sim.WinRate(boss, 1) <= 0.05);
    }

    [Fact]
    public void TheBossFallsToAPlayerWhoClearedTheIsland()
    {
        Monster boss = World.MonsterAt(1, 7, DioramaTheme.Light)!;
        Assert.True(Sim.WinRate(boss, 8) >= 0.8);
    }

    [Fact]
    public void TheDarkVariantIsHarderButStillBeatable()
    {
        foreach (Stage stage in Island1.Value.Stages)
        {
            Monster light = World.MonsterAt(1, stage.Number, DioramaTheme.Light)!;
            Monster dark = World.MonsterAt(1, stage.Number, DioramaTheme.Dark)!;

            Assert.True(dark.Hp > light.Hp, $"{light.Name}'s dark variant is no tougher");
            Assert.Equal(light.Speed, dark.Speed);
            Assert.NotEqual(light.Name, dark.Name);

            // The load-bearing half: a dark week is the worst possible moment
            // to make the game unwinnable.
            int level = Math.Min(Progression.MaxLevel, stage.Number + 2);
            double rate = Sim.WinRate(dark, level);
            Assert.True(rate >= 0.7, $"dark stage {stage.Number} wins only {rate:P0} at level {level}");
        }
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
    public void UnbuiltIslandsAreNamedButEmpty()
    {
        Assert.Equal(World.IslandCount, World.Islands.Count);
        Assert.True(World.IsBuilt(1));
        for (int n = 2; n <= World.IslandCount; n++)
        {
            Island island = World.IslandFor(n)!;
            Assert.False(World.IsBuilt(n));
            Assert.False(string.IsNullOrWhiteSpace(island.LightName));
            Assert.False(string.IsNullOrWhiteSpace(island.DarkName));
            Assert.Null(World.MonsterAt(n, 1, DioramaTheme.Light));
        }
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
