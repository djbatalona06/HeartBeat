using HeartBeat.Game.Core;
using HeartBeat.Game.Core.Models;

namespace HeartBeat.Game.Tests;

public class LoadoutTests
{
    [Fact]
    public void AnEmptySheetChangesNothing()
    {
        foreach (Style style in Enum.GetValues<Style>())
        {
            Assert.Equal(1.0, Loadout.StyleMultiplier(RaidStats.None, style));
        }
        Assert.Equal(0, Loadout.BonusHp(RaidStats.None, 100));
        Assert.Equal(0, Loadout.BonusSpeed(RaidStats.None));
    }

    [Fact]
    public void TheCurveRisesAndNeverPassesItsCap()
    {
        double previous = 0;
        foreach (int points in new[] { 1, 5, 20, 50, 200, 5000, int.MaxValue / 2 })
        {
            double now = Loadout.Curve(points, Loadout.PhysicalCap);
            Assert.True(now > previous);
            Assert.True(now < Loadout.PhysicalCap);
            previous = now;
        }
        Assert.Equal(Loadout.PhysicalCap / 2, Loadout.Curve((int)Loadout.HalfAt, Loadout.PhysicalCap), precision: 6);
    }

    [Fact]
    public void EachStatFeedsItsOwnStyle()
    {
        Assert.True(Loadout.StyleMultiplier(new RaidStats(Burden: 30), Style.Physical) > 1);
        Assert.Equal(1.0, Loadout.StyleMultiplier(new RaidStats(Burden: 30), Style.Magic));
        Assert.True(Loadout.StyleMultiplier(new RaidStats(Reveal: 30), Style.Magic) > 1);
        Assert.True(Loadout.StyleMultiplier(new RaidStats(Fortify: 30), Style.Defensive) > 1);
        Assert.True(Loadout.StyleMultiplier(new RaidStats(Recovery: 30), Style.Mend) > 1);
        Assert.True(Loadout.StyleMultiplier(new RaidStats(Resonance: 30), Style.Together) > 1);
        Assert.True(Loadout.BonusHp(new RaidStats(Resilience: 30), 100) > 0);
        Assert.True(Loadout.BonusSpeed(new RaidStats(Energy: 60)) > 0);
    }

    [Fact]
    public void ChargesParseLeniently()
    {
        Assert.Empty(Charges.Parse(null));
        Assert.Empty(Charges.Parse(""));
        Assert.Equal([Charge.Exercise, Charge.Bond], Charges.Parse("exercise, Bond,nonsense,Exercise"));
    }
}
