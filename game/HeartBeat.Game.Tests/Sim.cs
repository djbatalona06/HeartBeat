using HeartBeat.Game.Core;
using HeartBeat.Game.Core.Models;

namespace HeartBeat.Game.Tests;

/// <summary>
/// Plays a fight to the end so the balance tests can ask "is this winnable?"
/// rather than eyeballing a stat block.
///
/// The simulated player is deliberately not clever: it heals when it is badly
/// hurt and otherwise uses the hardest-hitting attack it has unlocked. That is
/// roughly what a real person does, and a monster that only loses to optimal
/// play is a monster that is too hard. The policy itself is
/// <see cref="PlayStyle.Simple"/> in <see cref="Forecast"/>, so the forecast a
/// player sees and the balance these tests hold are the same arithmetic.
/// </summary>
public static class Sim
{
    public const int RoundCap = Forecast.RoundCap;

    public static BattleState Fight(Monster monster, int level, uint seed, Boosts? boosts = null) =>
        Forecast.Play(monster, level, seed, boosts, PlayStyle.Simple);

    /// <summary>
    /// How often a level beats a monster across many seeds. Balance is a
    /// distribution, not a single fight - one unlucky seed proves nothing.
    /// </summary>
    public static double WinRate(Monster monster, int level, Boosts? boosts = null, int trials = Forecast.Trials)
    {
        int wins = 0;
        for (int t = 0; t < trials; t++)
        {
            if (Fight(monster, level, Forecast.SeedFor(monster, level, t), boosts).Outcome == Outcome.Won) wins++;
        }
        return wins / (double)trials;
    }
}
