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
/// play is a monster that is too hard.
/// </summary>
public static class Sim
{
    public const int RoundCap = 300;

    public static BattleState Fight(Monster monster, int level, uint seed, Boosts? boosts = null)
    {
        BattleState state = Battle.Begin(monster, level, seed, boosts);
        var available = Actions.UnlockedAt(level);

        PlayerAction? heal = available.FirstOrDefault(a => a.Type == ActionType.Heal);
        BattleState opening = state;
        PlayerAction best = available
            .Where(a => a.Type == ActionType.Attack)
            .OrderByDescending(a => Battle.PreviewDamage(opening, a, monster))
            .First();

        int guard = 0;
        while (state.Outcome == Outcome.Fighting && guard++ < RoundCap)
        {
            if (state.Turn == Side.Player)
            {
                bool hurt = state.Player.HpFraction < 0.35 && state.Player.Hp < state.Player.MaxHp;
                PlayerAction pick = hurt && heal is not null ? heal : best;
                state = Battle.Act(state, pick.Id, monster, level);
            }
            else
            {
                state = Battle.MonsterMove(state, monster);
            }
        }
        return state;
    }

    /// <summary>
    /// How often a level beats a monster across many seeds. Balance is a
    /// distribution, not a single fight - one unlucky seed proves nothing.
    /// </summary>
    public static double WinRate(Monster monster, int level, Boosts? boosts = null, int trials = 60)
    {
        int wins = 0;
        for (int t = 0; t < trials; t++)
        {
            if (Fight(monster, level, Rng.Hash($"{monster.Id}/{level}/{t}"), boosts).Outcome == Outcome.Won) wins++;
        }
        return wins / (double)trials;
    }
}
