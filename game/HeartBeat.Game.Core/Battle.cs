using HeartBeat.Game.Core.Models;

namespace HeartBeat.Game.Core;

/// <summary>
/// One fight, as a pure reducer.
///
/// The shape is lifted from <c>app/src/domain/rpg/encounter.ts</c> deliberately,
/// because that module's rules were the right ones and they survive the port:
///
/// * <b>Total.</b> Every function returns a state for every input. Acting on a
///   finished battle returns it unchanged - the real bug class in an overlay
///   somebody is tapping fast - and an unknown action logs a line instead of
///   throwing.
/// * <b>Clockless.</b> Nothing reads a clock or draws randomness. Every roll
///   comes from <see cref="Rng.Roll"/> against the battle's fixed seed and its
///   round, so the same seed and the same actions replay the same fight.
/// * <b>Nothing outlives the fight.</b> There is no HP anywhere but in a
///   <see cref="BattleState"/>. Losing costs the fight and nothing else.
///
/// What is new here is the element chart, which is the reason the battle is
/// worth having at all: a monster's weakness is its island's wellness axis, so
/// the way to beat Morning Meadow is to log movement.
/// </summary>
public static class Battle
{
    /// <summary>Damage multiplier when an action hits a weakness.</summary>
    public const double WeaknessMultiplier = 1.5;

    /// <summary>Damage multiplier when an action hits a resistance.</summary>
    public const double StrengthMultiplier = 0.5;

    /// <summary>
    /// A fresh fight.
    ///
    /// The player always moves first when their speed is at least the
    /// monster's, and otherwise gets a coin flip rather than an automatic loss
    /// of tempo - the same rule <c>encounter.ts:firstMover</c> uses, for the
    /// same reason: a fast monster should usually go first, never always.
    /// </summary>
    public static BattleState Begin(Monster monster, int level, uint seed)
    {
        PlayerStats stats = Progression.StatsAt(level);
        var player = new Combatant(
            Hp: stats.MaxHp,
            MaxHp: stats.MaxHp,
            Shield: 0,
            Attack: stats.Attack,
            Defense: stats.Defense,
            Speed: stats.Speed,
            Effects: []);

        var foe = new Combatant(
            Hp: monster.Hp,
            MaxHp: monster.Hp,
            Shield: 0,
            Attack: monster.Attack,
            Defense: monster.Defense,
            Speed: monster.Speed,
            Effects: []);

        Side first = stats.Speed >= monster.Speed
            ? Side.Player
            : Rng.Roll(seed, 0) < 0.5 ? Side.Player : Side.Monster;

        return new BattleState(
            MonsterId: monster.Id,
            Round: 1,
            Turn: first,
            Player: player,
            Monster: foe,
            Log: [new BattleLine(1, Side.Monster, $"{monster.Name} blocks the path.")],
            Outcome: Outcome.Fighting,
            Seed: seed,
            XpOwed: 0);
    }

    /// <summary>
    /// The element chart, in one expression.
    ///
    /// Weakness and strength are checked in that order and are not additive,
    /// because a monster is never authored weak and strong to the same element
    /// and a chart that quietly cancelled itself would be worse than one that
    /// picked a side.
    /// </summary>
    public static double Effectiveness(Element attack, Monster monster)
    {
        if (attack == monster.Weakness) return WeaknessMultiplier;
        if (attack == monster.Strength) return StrengthMultiplier;
        return 1.0;
    }

    /// <summary>
    /// Damage, before shield.
    ///
    /// Attack scales the power, defense subtracts at half weight, and the floor
    /// is 1: a fight where an action does literally nothing reads as a bug
    /// however correct the arithmetic was.
    /// </summary>
    public static int Damage(int attack, int power, int defense, double effectiveness, double wobble, int attackDownPercent)
    {
        double raw = ((attack * power) / 10.0) - (defense / 2.0);
        double scaled = raw * effectiveness * wobble * (1 - (Math.Clamp(attackDownPercent, 0, 90) / 100.0));
        return Math.Max(1, (int)Math.Round(scaled, MidpointRounding.AwayFromZero));
    }

    /// <summary>Take damage, shield first.</summary>
    private static (Combatant Next, int Dealt, int Blocked) Absorb(Combatant target, int damage)
    {
        int safe = Math.Max(0, damage);
        int guard = target.MagnitudeOf(StatusKind.Guard);
        if (guard > 0) safe = Math.Max(1, (int)Math.Round(safe * (1 - (Math.Clamp(guard, 0, 90) / 100.0))));

        int blocked = Math.Min(target.Shield, safe);
        int dealt = safe - blocked;
        return (target with { Hp = Math.Max(0, target.Hp - dealt), Shield = target.Shield - blocked }, dealt, blocked);
    }

    private static BattleState Settle(BattleState state, Monster monster)
    {
        if (state.Monster.Hp <= 0)
        {
            return state with
            {
                Outcome = Outcome.Won,
                XpOwed = state.XpOwed + Progression.XpForDefeating(monster.Type),
            };
        }
        if (state.Player.Hp <= 0) return state with { Outcome = Outcome.Down };
        return state;
    }

    /// <summary>Count down every effect on a side and drop the expired ones.</summary>
    private static Combatant TickEffects(Combatant who, out int drained)
    {
        drained = who.MagnitudeOf(StatusKind.Drain);
        var kept = who.Effects.Select(e => e.Tick()).Where(e => !e.Expired).ToList();
        return who with
        {
            Hp = Math.Max(0, who.Hp - drained),
            Effects = kept,
        };
    }

    private static BattleState Say(BattleState state, Side who, string text) =>
        state with { Log = [.. state.Log, new BattleLine(state.Round, who, text)] };

    /// <summary>
    /// One action from the player.
    ///
    /// Returns the state untouched when the battle is over or it is not the
    /// player's turn, so a double tap costs nothing.
    /// </summary>
    public static BattleState Act(BattleState state, string actionId, Monster monster, int level)
    {
        if (state.Outcome != Outcome.Fighting || state.Turn != Side.Player) return state;

        if (string.Equals(actionId, "flee", StringComparison.Ordinal)) return Flee(state, monster);

        PlayerAction? action = Actions.ById(actionId);
        if (action is null) return Say(state, Side.Player, "Nothing happens.");
        if (action.UnlockLevel > level) return Say(state, Side.Player, $"{action.Name} is not yours yet.");

        double wobble = Rng.Wobble(state.Seed, state.Round * 3);
        BattleState next = state;

        switch (action.Type)
        {
            case ActionType.Attack:
            {
                double effectiveness = Effectiveness(action.Element, monster);
                int damage = Damage(
                    state.Player.Attack,
                    action.Power,
                    state.Monster.Defense,
                    effectiveness,
                    wobble,
                    state.Player.MagnitudeOf(StatusKind.AttackDown));

                (Combatant foe, int dealt, int blocked) = Absorb(state.Monster, damage);
                string note = effectiveness > 1 ? " It flinches - that one landed."
                    : effectiveness < 1 ? " It barely notices."
                    : "";
                string blockNote = blocked > 0 ? $" {blocked} turned aside." : "";
                next = Say(next with { Monster = foe }, Side.Player, $"{action.Name} hits for {dealt}.{blockNote}{note}");
                break;
            }

            case ActionType.Heal:
            {
                // Power is a percentage of maximum HP for heals, so the
                // level-4 unlock keeps its value as the island gets harder.
                int amount = Math.Max(1, (int)Math.Round(state.Player.MaxHp * (action.Power / 100.0)));
                int healed = Math.Min(amount, state.Player.MaxHp - state.Player.Hp);
                next = Say(
                    next with { Player = state.Player with { Hp = state.Player.Hp + healed } },
                    Side.Player,
                    healed > 0 ? $"{action.Name}. +{healed} back." : $"{action.Name}. Nothing left to mend.");
                break;
            }

            case ActionType.Shield:
            {
                next = Say(
                    next with { Player = state.Player with { Shield = state.Player.Shield + action.Power } },
                    Side.Player,
                    $"{action.Name}. +{action.Power} ward.");
                break;
            }

            case ActionType.Debuff:
            {
                var effect = action.Status ?? new StatusEffect(StatusKind.AttackDown, action.Power, 1);
                next = Say(
                    next with { Monster = state.Monster with { Effects = [.. state.Monster.Effects, effect] } },
                    Side.Player,
                    $"{action.Name} takes hold.");
                break;
            }
        }

        Combatant ticked = TickEffects(next.Player, out int drained);
        if (drained > 0) next = Say(next, Side.Player, $"The drain takes {drained}.");

        return Settle(next with { Player = ticked, Turn = Side.Monster }, monster);
    }

    /// <summary>
    /// Backing away. Never certain, never impossible.
    ///
    /// Speed decides, because speed is the stat the player can see and it is
    /// the only one that has no other use in a fight.
    /// </summary>
    public static BattleState Flee(BattleState state, Monster monster)
    {
        if (state.Outcome != Outcome.Fighting || state.Turn != Side.Player) return state;

        double edge = (state.Player.Speed - monster.Speed) * 0.05;
        double chance = Math.Clamp(0.6 + edge, 0.35, 0.9);

        if (Rng.Roll(state.Seed, state.Round * 3 + 1) < chance)
        {
            return Say(state with { Outcome = Outcome.Fled }, Side.Player, "You back away, and it lets you.");
        }
        return Say(state with { Turn = Side.Monster }, Side.Player, "You try to back away. It follows.");
    }

    /// <summary>
    /// The monster's move. Its own function so the overlay can pace the two
    /// apart and play an animation between them.
    ///
    /// The whole AI is: pick an action by seeded roll, weighted so the first
    /// action in the list is the default and the specials are occasional. There
    /// is no planner, and there should not be one - a monster that outplays a
    /// person logging their mood has misunderstood the assignment.
    /// </summary>
    public static BattleState MonsterMove(BattleState state, Monster monster)
    {
        if (state.Outcome != Outcome.Fighting || state.Turn != Side.Monster) return state;
        if (monster.Actions.Count == 0) return state with { Turn = Side.Player, Round = state.Round + 1 };

        double pick = Rng.Roll(state.Seed, state.Round * 3 + 2);
        // The first action is the bread-and-butter one and comes up half the
        // time; the rest share what is left.
        int index = pick < 0.5 ? 0 : 1 + (int)(((pick - 0.5) / 0.5) * (monster.Actions.Count - 1));
        MonsterAction action = monster.Actions[Math.Clamp(index, 0, monster.Actions.Count - 1)];

        double wobble = Rng.Wobble(state.Seed, state.Round * 3 + 3);
        BattleState next = state;

        switch (action.Type)
        {
            case ActionType.Attack:
            {
                int damage = Damage(
                    state.Monster.Attack,
                    action.Power,
                    state.Player.Defense,
                    1.0,
                    wobble,
                    state.Monster.MagnitudeOf(StatusKind.AttackDown));

                (Combatant you, int dealt, int blocked) = Absorb(state.Player, damage);
                string blockNote = blocked > 0 ? $" Your ward takes {blocked}." : "";
                next = Say(next with { Player = you }, Side.Monster, $"{action.Name} hits for {dealt}.{blockNote}");
                break;
            }

            case ActionType.Heal:
            {
                int healed = Math.Min(action.Power, state.Monster.MaxHp - state.Monster.Hp);
                next = Say(
                    next with { Monster = state.Monster with { Hp = state.Monster.Hp + healed } },
                    Side.Monster,
                    $"{monster.Name} uses {action.Name} and recovers {healed}.");
                break;
            }

            case ActionType.Shield:
            {
                var guard = action.Status ?? new StatusEffect(StatusKind.Guard, action.Power, 2);
                next = Say(
                    next with { Monster = state.Monster with { Effects = [.. state.Monster.Effects, guard] } },
                    Side.Monster,
                    $"{monster.Name} draws in. {action.Name}.");
                break;
            }

            case ActionType.Debuff:
            {
                var effect = action.Status ?? new StatusEffect(StatusKind.SpeedDown, action.Power, 1);
                next = Say(
                    next with { Player = state.Player with { Effects = [.. state.Player.Effects, effect] } },
                    Side.Monster,
                    $"{action.Name}. It settles on you.");
                break;
            }
        }

        Combatant ticked = TickEffects(next.Monster, out int drained);
        if (drained > 0) next = Say(next, Side.Monster, $"{monster.Name} sheds {drained}.");

        return Settle(next with { Monster = ticked, Turn = Side.Player, Round = state.Round + 1 }, monster);
    }

    /// <summary>
    /// Plain hits left, for the "is this going anywhere" read the battle log
    /// panel shows. Assumes the player's opening action and no crits.
    /// </summary>
    public static int HitsLeft(BattleState state, Monster monster)
    {
        int perHit = Damage(state.Player.Attack, Actions.Strike.Power, state.Monster.Defense,
            Effectiveness(Actions.Strike.Element, monster), 1.0, 0);
        return (int)Math.Ceiling(state.Monster.Hp / (double)Math.Max(1, perHit));
    }
}
