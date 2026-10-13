using HeartBeat.Game.Core;
using HeartBeat.Game.Core.Data;
using HeartBeat.Game.Core.Models;

namespace HeartBeat.Game.Tests;

/// <summary>
/// The pre-fight forecast: it must agree with the balance the island tests
/// hold, it must be the same on every phone, and its "Why?" must talk about the
/// fight and never about the person.
/// </summary>
public class ForecastTests
{
    private static Monster At(int island, int stage, DioramaTheme theme = DioramaTheme.Light) =>
        World.MonsterAt(island, stage, theme)!;

    [Fact]
    public void TheSameBuildGetsTheSameForecastEveryTime()
    {
        // Two phones asking about the same fight must not disagree.
        Monster boss = At(10, 7);
        ForecastResult a = Forecast.For(boss, 44);
        ForecastResult b = Forecast.For(boss, 44);
        Assert.Equal(a with { Why = [] }, b with { Why = [] });
        Assert.Equal(a.Why, b.Why);
    }

    [Fact]
    public void TheSimpleRateIsTheBalanceTestsOwnRate()
    {
        // One policy, two callers. If these ever part, the forecast is
        // predicting a fight nobody tuned.
        foreach ((int island, int stage, int level) in new[] { (1, 7, 6), (5, 4, 20), (10, 7, 42) })
        {
            Monster m = At(island, stage);
            Assert.Equal(Sim.WinRate(m, level), Forecast.For(m, level).SimpleWinRate);
        }
    }

    [Fact]
    public void DayOneLooksLikelyAndOffersNoAssist()
    {
        ForecastResult f = Forecast.For(At(1, 1), 1);
        Assert.Equal(Verdict.Likely, f.Verdict);
        Assert.False(f.AssistSuggested);
    }

    [Theory]
    [MemberData(nameof(IslandTests.IslandNumbers), MemberType = typeof(IslandTests))]
    public void ABossAtTheStartOfItsIslandLooksTough(int island)
    {
        ForecastResult f = Forecast.For(At(island, 7), IslandTests.BandStart(island));
        Assert.Equal(Verdict.Tough, f.Verdict);
        Assert.True(f.AssistSuggested);
    }

    [Theory]
    [MemberData(nameof(IslandTests.EveryStage), MemberType = typeof(IslandTests))]
    public void EveryStageLooksLikelyOnArrival(int island, int stage)
    {
        // The island tests prove 80% at arrival; the forecast must say so too,
        // or it would be warning people off fights that are fine.
        ForecastResult f = Forecast.For(At(island, stage), IslandTests.ArrivalLevel(island, stage));
        Assert.Equal(Verdict.Likely, f.Verdict);
        Assert.False(f.AssistSuggested);
    }

    [Theory]
    [MemberData(nameof(IslandTests.EveryStage), MemberType = typeof(IslandTests))]
    public void CarefulPlayIsNeverMeaningfullyWorse(int island, int stage)
    {
        // A level short, where the gap between the two shows. Careful play may
        // trade a little on an unlucky seed, never a real share of the fights.
        ForecastResult f = Forecast.For(At(island, stage), IslandTests.ArrivalLevel(island, stage) - 1);
        Assert.True(f.CarefulWinRate >= f.SimpleWinRate - 0.1, $"careful {f.CarefulWinRate:P0} vs simple {f.SimpleWinRate:P0}");
    }

    [Theory]
    [InlineData(1.0, Verdict.Likely)]
    [InlineData(Forecast.LikelyAt, Verdict.Likely)]
    [InlineData(0.79, Verdict.Close)]
    [InlineData(Forecast.CloseAt, Verdict.Close)]
    [InlineData(0.49, Verdict.Tough)]
    [InlineData(0.0, Verdict.Tough)]
    public void TheVerdictIsReadOffTheSimpleRate(double rate, Verdict expected) =>
        Assert.Equal(expected, Forecast.VerdictFor(rate));

    [Fact]
    public void EveryForecastIsInternallyConsistent()
    {
        foreach (Island island in World.Islands)
        foreach (Stage stage in island.Stages)
        {
            int level = IslandTests.ArrivalLevel(island.Number, stage.Number) - 2;
            ForecastResult f = Forecast.For(stage.Monster, Math.Max(1, level));
            Assert.Equal(Forecast.VerdictFor(f.SimpleWinRate), f.Verdict);
            Assert.Equal(f.Verdict != Verdict.Likely, f.AssistSuggested);
            Assert.InRange(f.LowerTailHp, 0, f.MedianEndingHp);
            Assert.InRange(f.MedianEndingHp, 0, 1);
            Assert.True(f.ExpectedRounds > 0);
        }
    }

    [Fact]
    public void TheWardensDoubleBlowIsNamed()
    {
        // The late-game spike the scan pointed at: Island 10's boss, two hits a
        // turn, each a real share of a level-44 health bar.
        ForecastResult f = Forecast.For(At(10, 7), 44);
        Assert.Contains(f.Why, r => r.Code == "big-hits");
        Assert.Contains(f.Why, r => r.Code == "two-blows");
    }

    [Fact]
    public void ABruisersHeavyBlowPointsAtGuard()
    {
        Monster bruiser = World.Islands.SelectMany(i => i.Stages).Select(s => s.Monster).First(m => m.Behavior == Behavior.Bruiser);
        ForecastReason heavy = Assert.Single(Forecast.Reasons(bruiser, 1, Boosts.None, 1, 1), r => r.Code == "heavy-blow");
        Assert.Contains("Guard", heavy.Text, StringComparison.Ordinal);
    }

    [Fact]
    public void WhenCarefulPlayWinsFarMoreOftenItSaysSo()
    {
        // Island 10's boss two levels early: tapping the biggest button rarely
        // wins, healing a little sooner usually does. That is the tip to give.
        ForecastResult f = Forecast.For(At(10, 7), 42);
        Assert.True(f.CarefulWinRate - f.SimpleWinRate >= 0.2);
        Assert.Contains(f.Why, r => r.Code == "heal-earlier");
    }

    [Fact]
    public void TodaysChargeOnTheWeaknessIsNamedInsteadOfTheHint()
    {
        Monster m = At(1, 1);
        Charge answer = Enum.GetValues<Charge>().First(c => Charges.ElementOf(c) == m.Weakness);
        var lit = Forecast.Reasons(m, 1, new Boosts([answer], RaidStats.None), 1, 1);
        var plain = Forecast.Reasons(m, 1, Boosts.None, 1, 1);
        Assert.Contains(lit, r => r.Code == "weakness-lit");
        Assert.DoesNotContain(lit, r => r.Code == "weakness");
        Assert.Contains(plain, r => r.Code == "weakness");
    }

    [Fact]
    public void TheWhyIsShortUniqueAndAboutTheFight()
    {
        // No reason may talk about the person: not their week, not their
        // partner, not a streak. Those are not skill, and naming them would turn
        // a forecast into a judgement.
        string[] personal = ["partner", "streak", "week", "missed", "you haven't", "skipped"];
        foreach (Island island in World.Islands)
        foreach (Stage stage in island.Stages)
        foreach (DioramaTheme face in Enum.GetValues<DioramaTheme>())
        {
            Monster m = World.MonsterAt(island.Number, stage.Number, face)!;
            var why = Forecast.Reasons(m, IslandTests.ArrivalLevel(island.Number, stage.Number), Boosts.None, 0.3, 0.9);
            Assert.InRange(why.Count, 1, Forecast.MaxReasons);
            Assert.Equal(why.Count, why.Select(r => r.Code).Distinct(StringComparer.Ordinal).Count());
            foreach (ForecastReason r in why)
            foreach (string word in personal)
                Assert.DoesNotContain(word, r.Text, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public void TheWorstTurnShareMatchesTheReducersOwnArithmetic()
    {
        // Island 10's Warden at level 44: its hardest attack, halved and struck
        // twice, at the top of the wobble - the 28%-of-health figure the scan
        // worked out by hand.
        Monster boss = At(10, 7);
        BattleState opening = Battle.Begin(boss, 44, 0);
        int power = boss.Actions.Where(a => a.Type == ActionType.Attack).Max(a => a.Power);
        int perHit = Battle.Damage(boss.Attack, power, opening.Player.Defense, Behaviours.SwarmHitScale, 1 + Rng.Variance, 0);
        Assert.Equal(perHit * 2 / (double)opening.Player.MaxHp, Forecast.WorstTurnShare(boss, opening), 6);
    }
}
