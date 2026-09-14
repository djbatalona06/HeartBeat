using HeartBeat.Game.Core;
using HeartBeat.Game.Core.Models;

namespace HeartBeat.Game.Tests;

public class ProgressionTests
{
    [Fact]
    public void LevelOneCostsNothing() => Assert.Equal(0, Progression.XpForLevel(1));

    [Theory]
    [InlineData(2, 282)]
    [InlineData(5, 1118)]
    [InlineData(10, 3162)]
    public void CurveMatchesTheSpec(int level, int expected) =>
        Assert.Equal(expected, Progression.XpForLevel(level));

    [Fact]
    public void CurveIsStrictlyRising()
    {
        for (int level = 2; level <= Progression.MaxLevel; level++)
        {
            Assert.True(Progression.XpForLevel(level) > Progression.XpForLevel(level - 1));
        }
    }

    [Fact]
    public void LevelForXpInvertsTheCurve()
    {
        for (int level = 1; level <= Progression.MaxLevel; level++)
        {
            Assert.Equal(level, Progression.LevelForXp(Progression.XpForLevel(level)));
            // One XP short of a level must still be the level below it.
            if (level > 1) Assert.Equal(level - 1, Progression.LevelForXp(Progression.XpForLevel(level) - 1));
        }
    }

    [Fact]
    public void LevelIsClampedAtBothEnds()
    {
        Assert.Equal(1, Progression.LevelForXp(0));
        Assert.Equal(1, Progression.LevelForXp(-500));
        Assert.Equal(Progression.MaxLevel, Progression.LevelForXp(int.MaxValue));
    }

    [Fact]
    public void ProgressWithinLevelSpansTheWholeBand()
    {
        Assert.Equal(0, Progression.ProgressWithinLevel(Progression.XpForLevel(3)), precision: 6);
        Assert.InRange(Progression.ProgressWithinLevel(Progression.XpForLevel(3) + 1), 0, 1);
        Assert.Equal(1, Progression.ProgressWithinLevel(Progression.XpForLevel(Progression.MaxLevel)), precision: 6);
    }

    [Fact]
    public void StatsFollowTheRewardTable()
    {
        Assert.Equal(new PlayerStats(60, 12, 5, 5), Progression.StatsAt(1));
        Assert.Equal(new PlayerStats(60, 12, 5, 5), Progression.StatsAt(2));
        Assert.Equal(new PlayerStats(80, 12, 5, 5), Progression.StatsAt(3));
        Assert.Equal(new PlayerStats(80, 18, 5, 5), Progression.StatsAt(5));
        Assert.Equal(new PlayerStats(80, 18, 10, 5), Progression.StatsAt(7));
        Assert.Equal(new PlayerStats(120, 18, 10, 5), Progression.StatsAt(10));
    }

    [Fact]
    public void StatsNeverGoBackwards()
    {
        for (int level = 2; level <= Progression.MaxLevel; level++)
        {
            PlayerStats prev = Progression.StatsAt(level - 1);
            PlayerStats now = Progression.StatsAt(level);
            Assert.True(now.MaxHp >= prev.MaxHp && now.Attack >= prev.Attack && now.Defense >= prev.Defense);
        }
    }

    [Fact]
    public void StatsAboveMaxLevelStayAtMaxLevel() =>
        Assert.Equal(Progression.StatsAt(Progression.MaxLevel), Progression.StatsAt(99));

    [Fact]
    public void EveryLevelFromTwoUpSaysWhatItGave()
    {
        for (int level = 2; level <= Progression.MaxLevel; level++)
        {
            Assert.False(string.IsNullOrWhiteSpace(Progression.RewardTextAt(level)));
        }
    }

    [Theory]
    [InlineData(Activity.Mood, 10)]
    [InlineData(Activity.Exercise, 25)]
    [InlineData(Activity.Work, 15)]
    [InlineData(Activity.Rest, 10)]
    [InlineData(Activity.Gratitude, 20)]
    public void ActivityXpMatchesTheSpec(Activity activity, int expected) =>
        Assert.Equal(expected, Progression.XpFor(activity));

    [Theory]
    [InlineData(MonsterType.Common, 30)]
    [InlineData(MonsterType.SemiBoss, 75)]
    [InlineData(MonsterType.Boss, 200)]
    public void DefeatXpMatchesTheSpec(MonsterType type, int expected) =>
        Assert.Equal(expected, Progression.XpForDefeating(type));

    [Fact]
    public void EliteSitsBetweenSemiBossAndBoss() =>
        Assert.InRange(
            Progression.XpForDefeating(MonsterType.Elite),
            Progression.XpForDefeating(MonsterType.SemiBoss),
            Progression.XpForDefeating(MonsterType.Boss));

    [Fact]
    public void EveryActionUnlocksAtOrBelowMaxLevel()
    {
        foreach (PlayerAction action in Actions.All)
        {
            Assert.InRange(action.UnlockLevel, 1, Progression.MaxLevel);
        }
    }

    [Fact]
    public void ANewCoupleCanAlreadyFight() =>
        Assert.Contains(Actions.Strike, Actions.UnlockedAt(1));

    [Fact]
    public void UnlocksOnlyEverGrow()
    {
        for (int level = 2; level <= Progression.MaxLevel; level++)
        {
            var before = Actions.UnlockedAt(level - 1);
            var after = Actions.UnlockedAt(level);
            Assert.True(after.Count >= before.Count);
            foreach (PlayerAction a in before) Assert.Contains(a, after);
        }
    }

    [Fact]
    public void ActionIdsAreUniqueAndResolvable()
    {
        Assert.Equal(Actions.All.Count, Actions.All.Select(a => a.Id).Distinct(StringComparer.Ordinal).Count());
        foreach (PlayerAction a in Actions.All) Assert.Equal(a, Actions.ById(a.Id));
        Assert.Null(Actions.ById("nonsense"));
    }
}
