using System.Text.Json;
using HeartBeat.Game.Core;
using HeartBeat.Game.Core.Data;
using HeartBeat.Game.Core.Models;

namespace HeartBeat.Game.Tests;

/// <summary>
/// The enemy playstyles: that they are different, that they are fair, and that
/// the warning a player is given is the move they get.
///
/// The island balance tests were tuned against <see cref="Behavior.Steady"/>.
/// What these hold is that every other behaviour is a different <i>rhythm</i> of
/// about the same damage, so those tests keep meaning what they meant.
/// </summary>
public class BehaviourTests
{
    private static IEnumerable<(Island Island, Stage Stage)> WithBehaviour() =>
        World.Islands.SelectMany(i => i.Stages.Select(s => (i, s))).Where(x => x.s.Monster.Behavior != Behavior.Steady);

    public static TheoryData<int, int> BehaviourStages()
    {
        var data = new TheoryData<int, int>();
        foreach ((Island island, Stage stage) in WithBehaviour()) data.Add(island.Number, stage.Number);
        return data;
    }

    private static BattleState OnMonstersTurn(Monster m, int round, uint seed = 11u, int level = 20)
    {
        BattleState state = Battle.Begin(m, level, seed);
        return state with
        {
            Round = round,
            Turn = Side.Monster,
            // Enough health to take every blow, so a long run of rounds is a
            // measurement and not a fight that ends.
            Player = state.Player with { Hp = 50_000_000, MaxHp = 50_000_000 },
        };
    }

    [Fact]
    public void ThirtyFightsCarryAPlaystyleAndOnlyTheBiggerOnes()
    {
        var found = WithBehaviour().ToList();
        Assert.Equal(30, found.Count);
        Assert.All(found, x => Assert.Contains(x.Stage.Number, new[] { 4, 6, 7 }));
    }

    [Fact]
    public void EveryPlaystyleIsUsedSomewhere()
    {
        var used = WithBehaviour().Select(x => x.Stage.Monster.Behavior).ToHashSet();
        foreach (Behavior b in Enum.GetValues<Behavior>().Where(b => b != Behavior.Steady))
        {
            Assert.True(used.Contains(b), $"nothing fights as a {b}");
        }
    }

    [Theory]
    [MemberData(nameof(BehaviourStages))]
    public void AMonsterHasTheActionsItsPlaystyleNeeds(int island, int stage)
    {
        Monster m = World.MonsterAt(island, stage, DioramaTheme.Light)!;
        Assert.Contains(m.Actions, a => a.Type == ActionType.Attack);
        switch (m.Behavior)
        {
            case Behavior.Healer:
                Assert.Contains(m.Actions, a => a.Type == ActionType.Heal);
                break;
            case Behavior.Drainer:
                Assert.Contains(m.Actions, a => a.Status is { Kind: StatusKind.Drain });
                break;
        }
    }

    [Fact]
    public void TheDarkFaceKeepsItsPlaystyle()
    {
        foreach ((Island island, Stage stage) in WithBehaviour())
        {
            Monster dark = World.MonsterAt(island.Number, stage.Number, DioramaTheme.Dark)!;
            Assert.Equal(stage.Monster.Behavior, dark.Behavior);
        }
    }

    [Fact]
    public void SteadyIsExactlyTheOriginalPick()
    {
        // The pick every monster made before playstyles existed, written out
        // again here so a change to Steady has to be a decision.
        foreach (Monster m in World.Islands.SelectMany(i => i.Stages).Select(s => s.Monster with { Behavior = Behavior.Steady }))
        {
            for (int round = 1; round <= 30; round++)
            {
                BattleState state = OnMonstersTurn(m, round, (uint)(round * 977));
                double pick = Rng.Roll(state.Seed, state.Round * 3 + 2);
                int index = pick < 0.5 ? 0 : 1 + (int)(((pick - 0.5) / 0.5) * (m.Actions.Count - 1));
                MonsterAction expected = m.Actions[Math.Clamp(index, 0, m.Actions.Count - 1)];
                MonsterPlan plan = Behaviours.Plan(state, m);
                Assert.Same(expected, plan.Action);
                Assert.Equal(1.0, plan.Scale);
                Assert.Equal(1, plan.Hits);
                Assert.False(plan.Misses);
                Assert.Null(plan.Telegraph);
            }
        }
    }

    [Fact]
    public void ABruiserGathersJabsAndThenStrikesHard()
    {
        Monster m = World.MonsterAt(1, 7, DioramaTheme.Light)!;
        Assert.Equal(Behavior.Bruiser, m.Behavior);

        MonsterPlan first = Behaviours.Plan(OnMonstersTurn(m, 1), m);
        MonsterPlan second = Behaviours.Plan(OnMonstersTurn(m, 2), m);
        MonsterPlan third = Behaviours.Plan(OnMonstersTurn(m, 3), m);
        MonsterPlan fourth = Behaviours.Plan(OnMonstersTurn(m, 4), m);

        Assert.NotEqual(ActionType.Attack, first.Action!.Type);
        Assert.Equal(ActionType.Attack, second.Action!.Type);
        Assert.True(second.Scale < 1);
        Assert.Equal(ActionType.Attack, third.Action!.Type);
        Assert.True(third.Scale > 1);
        Assert.Equal("heavy", third.Telegraph);
        // And it starts over.
        Assert.Equal(first.Action, fourth.Action);
        Assert.Null(first.Telegraph);
        Assert.Null(second.Telegraph);
    }

    [Fact]
    public void ASwarmStrikesTwiceForLessWheneverItAttacks()
    {
        Monster m = World.MonsterAt(3, 4, DioramaTheme.Light)!;
        Assert.Equal(Behavior.Swarm, m.Behavior);
        bool sawAttack = false;
        for (int round = 1; round <= 40; round++)
        {
            MonsterPlan plan = Behaviours.Plan(OnMonstersTurn(m, round), m);
            if (plan.Action?.Type != ActionType.Attack) continue;
            sawAttack = true;
            Assert.Equal(2, plan.Hits);
            Assert.True(plan.Scale < 1);
            Assert.Equal("flurry", plan.Telegraph);
        }
        Assert.True(sawAttack);
    }

    [Fact]
    public void AGuardianRaisesItsGuardThenAnswersWithTwoBlows()
    {
        Monster m = World.MonsterAt(1, 6, DioramaTheme.Light)!;
        Assert.Equal(Behavior.Guardian, m.Behavior);
        MonsterPlan ward = Behaviours.Plan(OnMonstersTurn(m, 1), m);
        Assert.Equal(ActionType.Shield, ward.Action!.Type);
        Assert.Equal("guard", ward.Telegraph);
        Assert.Equal(ActionType.Attack, Behaviours.Plan(OnMonstersTurn(m, 2), m).Action!.Type);
        Assert.Equal(ActionType.Attack, Behaviours.Plan(OnMonstersTurn(m, 3), m).Action!.Type);
        Assert.Equal(ActionType.Shield, Behaviours.Plan(OnMonstersTurn(m, 4), m).Action!.Type);
    }

    [Fact]
    public void ADrainerLaysTheDrainFirst()
    {
        Monster m = World.MonsterAt(4, 7, DioramaTheme.Light)!;
        Assert.Equal(Behavior.Drainer, m.Behavior);
        MonsterPlan plan = Behaviours.Plan(OnMonstersTurn(m, 1), m);
        Assert.Equal(StatusKind.Drain, plan.Action!.Status!.Value.Kind);
        Assert.Equal("drain", plan.Telegraph);
    }

    [Fact]
    public void ATricksterMissesAboutAsOftenAsItSays()
    {
        Monster m = World.MonsterAt(2, 4, DioramaTheme.Light)!;
        Assert.Equal(Behavior.Trickster, m.Behavior);
        int attacks = 0, misses = 0;
        for (int round = 1; round <= 2000; round++)
        {
            MonsterPlan plan = Behaviours.Plan(OnMonstersTurn(m, round, (uint)(round * 31)), m);
            if (plan.Action?.Type != ActionType.Attack) continue;
            attacks++;
            if (plan.Misses) misses++;
        }
        Assert.InRange(misses / (double)attacks, Behaviours.TricksterMissChance - 0.04, Behaviours.TricksterMissChance + 0.04);
    }

    [Fact]
    public void AHealerMendsOnlyWhenItIsHurt()
    {
        Monster m = World.MonsterAt(1, 4, DioramaTheme.Light)!;
        Assert.Equal(Behavior.Healer, m.Behavior);

        BattleState healthy = OnMonstersTurn(m, 2);
        BattleState hurt = healthy with { Monster = healthy.Monster with { Hp = healthy.Monster.MaxHp / 4 } };

        MonsterPlan whenHurt = Behaviours.Plan(hurt, m);
        Assert.Equal(ActionType.Heal, whenHurt.Action!.Type);
        Assert.Equal("mend", whenHurt.Telegraph);
        // A healthy Healer on an even round does what a Steady one would.
        Assert.Same(Behaviours.Plan(healthy with { Monster = healthy.Monster }, m with { Behavior = Behavior.Steady }).Action,
            Behaviours.Plan(healthy, m).Action);
    }

    /// <summary>
    /// The promise of a telegraph: what is announced is what is played. They are
    /// the same call, and this walks every playstyle to prove it end to end.
    /// </summary>
    [Theory]
    [MemberData(nameof(BehaviourStages))]
    public void WhatIsAnnouncedIsWhatHappens(int island, int stage)
    {
        Monster m = World.MonsterAt(island, stage, DioramaTheme.Light)!;
        for (int round = 1; round <= 12; round++)
        {
            BattleState state = OnMonstersTurn(m, round, (uint)(round * 7), 25);
            string? warned = Behaviours.Telegraph(state, m);
            BattleState after = Battle.MonsterMove(state, m);
            string said = after.Log[^1].Text;

            switch (warned)
            {
                case "heavy": Assert.Contains("heavy blow", said, StringComparison.Ordinal); break;
                case "flurry": Assert.Contains("2 blows", said, StringComparison.Ordinal); break;
                case "guard": Assert.True(after.Monster.Has(StatusKind.Guard) || after.Monster.Effects.Count > 0, said); break;
                case "drain": Assert.True(after.Player.Has(StatusKind.Drain), said); break;
                case "mend": Assert.Contains("recovers", said, StringComparison.Ordinal); break;
                case null:
                    Assert.DoesNotContain("heavy blow", said, StringComparison.Ordinal);
                    Assert.DoesNotContain("2 blows", said, StringComparison.Ordinal);
                    break;
            }
        }
    }

    [Fact]
    public void NothingIsAnnouncedOnceTheFightIsOver()
    {
        Monster m = World.MonsterAt(1, 7, DioramaTheme.Light)!;
        BattleState state = OnMonstersTurn(m, 3) with { Outcome = Outcome.Won };
        Assert.Null(Behaviours.Telegraph(state, m));
    }

    /// <summary>
    /// The balance guarantee. Mean damage to the player per round, against the
    /// same monster on Steady: a playstyle that hit twice as hard would turn an
    /// island's winnable stage into a wall, and one that hit half as hard would
    /// make its boss a pushover.
    /// </summary>
    [Theory]
    [MemberData(nameof(BehaviourStages))]
    public void EveryPlaystyleDealsAboutAsMuchAsSteady(int island, int stage)
    {
        Monster m = World.MonsterAt(island, stage, DioramaTheme.Light)!;
        int level = IslandTests.ArrivalLevel(island, stage);

        double with = MeanLoss(m, level);
        double steady = MeanLoss(m with { Behavior = Behavior.Steady }, level);
        double ratio = with / Math.Max(1, steady);
        Assert.InRange(ratio, 0.8, 1.2);
    }

    /// <summary>Mean HP the player loses per round, over many seeds, striking back at a monster that cannot fall.</summary>
    private static double MeanLoss(Monster m, int level)
    {
        double lost = 0;
        int rounds = 0;
        for (uint seed = 1; seed <= 30; seed++)
        {
            BattleState state = Battle.Begin(m, level, seed * 7919u);
            state = state with
            {
                Turn = Side.Player,
                Player = state.Player with { Hp = 50_000_000, MaxHp = 50_000_000 },
                Monster = state.Monster with { Hp = 50_000_000, MaxHp = 50_000_000 },
            };
            int before = state.Player.Hp;
            for (int r = 0; r < 60; r++)
            {
                // Strike rather than guard: a ward would absorb what is being measured.
                state = Battle.Act(state, Actions.Strike.Id, m, level) with { Turn = Side.Monster };
                state = Battle.MonsterMove(state, m);
                rounds++;
            }
            lost += before - state.Player.Hp;
        }
        return lost / rounds;
    }

    [Fact]
    public void AFightWithAPlaystyleReplaysIdentically()
    {
        Monster boss = World.MonsterAt(3, 7, DioramaTheme.Light)!;
        BattleState a = Sim.Fight(boss, 14, 2024u);
        BattleState b = Sim.Fight(boss, 14, 2024u);
        Assert.Equal(a.Outcome, b.Outcome);
        Assert.Equal(a.Log.Select(l => l.Text), b.Log.Select(l => l.Text));
    }

    [Fact]
    public void EveryPlaystyleStillEndsItsFights()
    {
        foreach ((Island island, Stage stage) in WithBehaviour())
        {
            foreach (DioramaTheme theme in new[] { DioramaTheme.Light, DioramaTheme.Dark })
            {
                Monster m = World.MonsterAt(island.Number, stage.Number, theme)!;
                BattleState end = Sim.Fight(m, IslandTests.ArrivalLevel(island.Number, stage.Number), 5u);
                Assert.True(end.Round < Sim.RoundCap, $"{m.Name} never ended");
            }
        }
    }

    [Fact]
    public void ThePlaystyleAndTheWarningCrossTheBoundary()
    {
        // Island 1's boss is a Bruiser; on its heavy round (the third) the
        // battle carries the warning, and the stage carries the playstyle.
        JsonElement stage = JsonDocument.Parse(Api.Stage(1, 7, "light")!).RootElement;
        Assert.Equal("Bruiser", stage.GetProperty("monster").GetProperty("behavior").GetString());

        JsonElement first = JsonDocument.Parse(Api.BeginBattle(1, 7, "light", 8, 3)!).RootElement;
        Assert.True(first.TryGetProperty("telegraph", out _));

        // Play to the third round and read the warning off the wire.
        string state = Api.BeginBattle(1, 7, "light", 40, 9)!;
        string? warned = null;
        for (int i = 0; i < 40 && warned is null; i++)
        {
            JsonElement now = JsonDocument.Parse(state).RootElement;
            if (now.GetProperty("outcome").GetString() != "Fighting") break;
            if (now.GetProperty("turn").GetString() == "Player")
            {
                if (now.GetProperty("round").GetInt32() % 3 == 0)
                {
                    warned = now.GetProperty("telegraph").GetString();
                }
                state = Api.Act(state, "guard")!;
            }
            else
            {
                state = Api.MonsterMove(state)!;
            }
        }
        Assert.Equal("heavy", warned);
    }
}
