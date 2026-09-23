using HeartBeat.Game.Core;
using HeartBeat.Game.Core.Data;
using HeartBeat.Game.Core.Models;

namespace HeartBeat.Game.Tests;

public class BattleTests
{
    private static Monster Sprout => World.MonsterAt(1, 1, DioramaTheme.Light)!;
    private static Monster Sentinel => World.MonsterAt(1, 7, DioramaTheme.Light)!;

    [Fact]
    public void BeginIsPureAndRepeatable()
    {
        // Compared field by field rather than with Assert.Equal on the record:
        // BattleState holds IReadOnlyList members, and record equality compares
        // those by reference, so two structurally identical states are never ==.
        // That is a fact about C# records, not about this reducer.
        BattleState a = Battle.Begin(Sprout, 3, 42u);
        BattleState b = Battle.Begin(Sprout, 3, 42u);
        Assert.Equal(a.MonsterId, b.MonsterId);
        Assert.Equal(a.Round, b.Round);
        Assert.Equal(a.Turn, b.Turn);
        Assert.Equal(a.Outcome, b.Outcome);
        Assert.Equal(a.Seed, b.Seed);
        Assert.Equal(a.XpOwed, b.XpOwed);
        Assert.Equal(a.Player.Hp, b.Player.Hp);
        Assert.Equal(a.Player.MaxHp, b.Player.MaxHp);
        Assert.Equal(a.Monster.Hp, b.Monster.Hp);
        Assert.Equal(a.Log.Select(l => l.Text), b.Log.Select(l => l.Text));
    }

    [Fact]
    public void TheSameSeedAndActionsReplayTheSameFight()
    {
        BattleState a = Sim.Fight(Sentinel, 6, 4242u);
        BattleState b = Sim.Fight(Sentinel, 6, 4242u);
        Assert.Equal(a.Outcome, b.Outcome);
        Assert.Equal(a.Round, b.Round);
        Assert.Equal(a.Log.Count, b.Log.Count);
        Assert.Equal(a.Log.Select(l => l.Text), b.Log.Select(l => l.Text));
    }

    [Fact]
    public void DifferentSeedsDiverge()
    {
        var outcomes = Enumerable.Range(0, 40)
            .Select(i => Sim.Fight(Sentinel, 4, (uint)(i * 7919)))
            .Select(s => s.Log.Count)
            .Distinct()
            .Count();
        Assert.True(outcomes > 1, "every seed produced an identical-length fight");
    }

    [Fact]
    public void PlayerStartsAtFullHealthForTheirLevel()
    {
        BattleState state = Battle.Begin(Sprout, 5, 1u);
        Assert.Equal(Progression.StatsAt(5).MaxHp, state.Player.MaxHp);
        Assert.Equal(state.Player.MaxHp, state.Player.Hp);
        Assert.Equal(Outcome.Fighting, state.Outcome);
        Assert.Equal(0, state.XpOwed);
    }

    [Fact]
    public void ActingOutOfTurnChangesNothing()
    {
        BattleState state = Battle.Begin(Sprout, 3, 1u) with { Turn = Side.Monster };
        Assert.Same(state, Battle.Act(state, Actions.Strike.Id, Sprout, 3));
    }

    [Fact]
    public void ActingOnAFinishedFightChangesNothing()
    {
        BattleState done = Sim.Fight(Sprout, 5, 9u);
        Assert.NotEqual(Outcome.Fighting, done.Outcome);
        Assert.Same(done, Battle.Act(done, Actions.Strike.Id, Sprout, 5));
        Assert.Same(done, Battle.MonsterMove(done, Sprout));
    }

    [Fact]
    public void AnUnknownActionLogsInsteadOfThrowing()
    {
        BattleState state = Battle.Begin(Sprout, 3, 1u) with { Turn = Side.Player };
        BattleState after = Battle.Act(state, "nonsense", Sprout, 3);
        Assert.Equal(Outcome.Fighting, after.Outcome);
        Assert.Equal(state.Log.Count + 1, after.Log.Count);
        // It costs no turn: refusing an action is not the same as taking one.
        Assert.Equal(Side.Player, after.Turn);
    }

    [Fact]
    public void ALockedActionIsRefusedAndCostsNoTurn()
    {
        BattleState state = Battle.Begin(Sprout, 1, 1u) with { Turn = Side.Player };
        BattleState after = Battle.Act(state, Actions.Together.Id, Sprout, 1);
        Assert.Equal(Side.Player, after.Turn);
        Assert.Contains("not yours yet", after.Log[^1].Text, StringComparison.Ordinal);
    }

    [Fact]
    public void AChargeOnTheWeaknessHurtsMoreThanNoCharge()
    {
        // The Mossling is weak to Movement: a workout logged today lands on it.
        BattleState plain = Battle.Begin(Sprout, 3, 1u);
        BattleState charged = Battle.Begin(Sprout, 3, 1u, new Boosts([Charge.Exercise], RaidStats.None));
        BattleState offAxis = Battle.Begin(Sprout, 3, 1u, new Boosts([Charge.Work], RaidStats.None));

        int none = Battle.PreviewDamage(plain, Actions.Strike, Sprout);
        int weak = Battle.PreviewDamage(charged, Actions.Strike, Sprout);
        Assert.True(weak > none, $"a workout did not help ({weak} vs {none})");
        // A charge that feeds another style and misses the weakness changes nothing for this move.
        Assert.Equal(none, Battle.PreviewDamage(offAxis, Actions.Strike, Sprout));
    }

    [Fact]
    public void AChargeNeverCostsAnything()
    {
        // Every charge, against every island-1 monster, every attack: at least the uncharged number.
        foreach (Stage stage in Island1.Value.Stages)
        {
            Monster m = stage.Monster;
            BattleState plain = Battle.Begin(m, 5, 1u);
            foreach (Charge c in Enum.GetValues<Charge>())
            {
                BattleState charged = Battle.Begin(m, 5, 1u, new Boosts([c], RaidStats.None));
                foreach (PlayerAction a in Actions.All.Where(a => a.Type == ActionType.Attack))
                {
                    Assert.True(
                        Battle.PreviewDamage(charged, a, m) >= Battle.PreviewDamage(plain, a, m),
                        $"{c} made {a.Name} worse against {m.Name}");
                }
            }
        }
    }

    [Fact]
    public void MagicIgnoresDefenseAndPhysicalDoesNot()
    {
        Monster golem = World.MonsterAt(1, 6, DioramaTheme.Light)!;
        BattleState state = Battle.Begin(golem, 5, 1u);
        BattleState armoured = state with { Monster = state.Monster with { Defense = 60 } };
        Assert.Equal(Battle.PreviewDamage(state, Actions.Spell, golem), Battle.PreviewDamage(armoured, Actions.Spell, golem));
        Assert.True(Battle.PreviewDamage(armoured, Actions.Strike, golem) < Battle.PreviewDamage(state, Actions.Strike, golem));
    }

    [Fact]
    public void OpeningChargesChangeTheBody()
    {
        BattleState plain = Battle.Begin(Sprout, 5, 1u);
        BattleState fed = Battle.Begin(Sprout, 5, 1u, new Boosts([Charge.Nourish, Charge.Gratitude], RaidStats.None));
        Assert.True(fed.Player.MaxHp > plain.Player.MaxHp);
        Assert.Equal(fed.Player.MaxHp, fed.Player.Hp);
        Assert.True(fed.Player.Shield > 0);
        Assert.Equal(0, plain.Player.Shield);
    }

    [Fact]
    public void BalanceGoesFirstEvenAgainstSomethingFaster()
    {
        Monster wisp = World.MonsterAt(1, 5, DioramaTheme.Light)!; // speed 9 against level 1's 5
        for (uint seed = 0; seed < 40; seed++)
        {
            Assert.Equal(Side.Player, Battle.Begin(wisp, 1, seed, new Boosts([Charge.Balance], RaidStats.None)).Turn);
        }
    }

    [Fact]
    public void TheCompanionsNameForAMoveIsWhatTheLogSays()
    {
        BattleState state = Battle.Begin(Sprout, 3, 1u) with { Turn = Side.Player };
        BattleState after = Battle.Act(state, Actions.Spell.Id, Sprout, 3, "Wishfire");
        Assert.StartsWith("Wishfire hits for", after.Log[^1].Text, StringComparison.Ordinal);
    }

    [Fact]
    public void DamageNeverDropsToZero()
    {
        // A tiny attacker against a huge defense still does something: an
        // action that visibly does nothing reads as a bug.
        Assert.Equal(1, Battle.Damage(attack: 1, power: 1, defense: 999, effectiveness: 0.5, wobble: 0.8, attackDownPercent: 90));
    }

    [Fact]
    public void ShieldAbsorbsBeforeHealthDoes()
    {
        BattleState state = Battle.Begin(Sprout, 6, 3u);
        state = state with { Turn = Side.Player };
        BattleState warded = Battle.Act(state, Actions.Guard.Id, Sprout, 6);
        Assert.Equal(Actions.Guard.Power, warded.Player.Shield);

        BattleState hit = Battle.MonsterMove(warded with { Turn = Side.Monster }, Sprout);
        // Either the shield took it all, or HP only fell once the shield was spent.
        Assert.True(hit.Player.Shield < warded.Player.Shield || hit.Player.Hp == warded.Player.Hp);
        Assert.True(hit.Player.Shield >= 0);
    }

    [Fact]
    public void HealingNeverExceedsMaximum()
    {
        BattleState state = Battle.Begin(Sprout, 4, 5u) with { Turn = Side.Player };
        BattleState healed = Battle.Act(state, Actions.Mend.Id, Sprout, 4);
        Assert.Equal(healed.Player.MaxHp, healed.Player.Hp);
        Assert.True(healed.Player.Hp <= healed.Player.MaxHp);
    }

    [Fact]
    public void WinningBanksTheMonstersXpExactlyOnce()
    {
        BattleState won = Sim.Fight(Sprout, 5, 11u);
        Assert.Equal(Outcome.Won, won.Outcome);
        Assert.Equal(Progression.XpForDefeating(MonsterType.Common), won.XpOwed);

        // Further actions on a finished fight must not bank it again.
        BattleState again = Battle.Act(won, Actions.Strike.Id, Sprout, 5);
        Assert.Equal(won.XpOwed, again.XpOwed);
    }

    [Fact]
    public void LosingCostsNothingButTheFight()
    {
        // Level 1 against the boss is a loss, and it must bank no XP - the
        // encounter.ts ruling: nothing that outlives a fight is spent inside one.
        BattleState state = Sim.Fight(Sentinel, 1, 3u);
        Assert.Equal(Outcome.Down, state.Outcome);
        Assert.Equal(0, state.XpOwed);
    }

    [Fact]
    public void FleeingEndsTheFightWithoutXp()
    {
        // Seeded so the escape succeeds; the point is the bookkeeping, not the odds.
        BattleState state = Battle.Begin(Sprout, 5, 1u) with { Turn = Side.Player };
        BattleState fled = state;
        for (int i = 0; i < 20 && fled.Outcome == Outcome.Fighting; i++)
        {
            fled = Battle.Flee(fled with { Turn = Side.Player, Round = fled.Round + 1 }, Sprout);
        }
        Assert.Equal(Outcome.Fled, fled.Outcome);
        Assert.Equal(0, fled.XpOwed);
    }

    [Fact]
    public void DrainWearsOffRatherThanLasting()
    {
        var drained = new Combatant(100, 100, 0, 10, 5, 5, [new StatusEffect(StatusKind.Drain, 5, 3)]);
        BattleState state = Battle.Begin(Sentinel, 8, 2u) with { Player = drained, Turn = Side.Player };

        for (int i = 0; i < 6 && state.Outcome == Outcome.Fighting; i++)
        {
            state = Battle.Act(state with { Turn = Side.Player }, Actions.Strike.Id, Sentinel, 8);
        }
        Assert.DoesNotContain(state.Player.Effects, e => e.Kind == StatusKind.Drain);
    }

    [Fact]
    public void GuardReducesIncomingDamageWithoutBlockingItEntirely()
    {
        var bare = new Combatant(100, 100, 0, 10, 5, 5, []);
        var guarded = bare with { Effects = [new StatusEffect(StatusKind.Guard, 50, 2)] };

        // The Drifter is the one Island 1 monster with a single action, and that
        // action is an attack. Using it here tests the guard rather than the
        // monster AI's choice of move, which is what the seed would otherwise
        // be deciding.
        Monster drifter = World.MonsterAt(1, 5, DioramaTheme.Light)!;
        BattleState plain = Battle.Begin(drifter, 8, 6u) with { Player = bare, Turn = Side.Monster };
        BattleState warded = Battle.Begin(drifter, 8, 6u) with { Player = guarded, Turn = Side.Monster };

        int plainLoss = 100 - Battle.MonsterMove(plain, drifter).Player.Hp;
        int wardedLoss = 100 - Battle.MonsterMove(warded, drifter).Player.Hp;
        Assert.True(wardedLoss < plainLoss, $"guard did not reduce damage ({wardedLoss} vs {plainLoss})");
        Assert.True(wardedLoss > 0, "a guard must not make a side invulnerable");
    }

    [Fact]
    public void EveryFightTerminates()
    {
        // A fight that cannot end is the worst bug this reducer can have: the
        // overlay would simply never close. Every monster, every level.
        foreach (Island island in World.Islands)
        foreach (Stage stage in island.Stages)
        {
            foreach (DioramaTheme theme in new[] { DioramaTheme.Light, DioramaTheme.Dark })
            {
                Monster monster = World.MonsterAt(island.Number, stage.Number, theme)!;
                for (int level = 1; level <= Progression.MaxLevel; level += 3)
                {
                    BattleState end = Sim.Fight(monster, level, Rng.Hash($"{monster.Id}-{level}-{theme}"));
                    Assert.True(
                        end.Outcome != Outcome.Fighting,
                        $"{monster.Name} at level {level} ({theme}) ran past {Sim.RoundCap} rounds");
                }
            }
        }
    }

    [Fact]
    public void HitsLeftFallsAsTheMonsterDoes()
    {
        BattleState start = Battle.Begin(Sentinel, 8, 7u);
        BattleState hurt = start with { Monster = start.Monster with { Hp = start.Monster.Hp / 4 } };
        Assert.True(Battle.HitsLeft(hurt, Sentinel, 8) < Battle.HitsLeft(start, Sentinel, 8));
        Assert.True(Battle.HitsLeft(start, Sentinel, 8) > 0);
    }
}
