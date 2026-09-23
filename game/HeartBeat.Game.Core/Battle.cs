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
/// worth having at all: a monster's weakness is its island's wellness axis, and
/// the thing that hits it is a <see cref="Charge"/> - what the couple logged
/// today - rather than which button was pressed. The buttons are moves; see
/// <see cref="Actions"/>.
/// </summary>
public static class Battle
{
    /// <summary>Damage multiplier when a charge hits the monster's weakness.</summary>
    public const double WeaknessMultiplier = 1.5;

    /// <summary>By this round a monster's heals have faded to nothing.</summary>
    public const int MonsterHealFadeRounds = 20;

    /// <summary>
    /// A fresh fight.
    ///
    /// The player always moves first when their speed is at least the
    /// monster's, and otherwise gets a coin flip rather than an automatic loss
    /// of tempo - the same rule <c>encounter.ts:firstMover</c> uses, for the
    /// same reason: a fast monster should usually go first, never always. A
    /// Balance charge settles the flip in the player's favour.
    ///
    /// The opening is also where the charges and the raid sheet that change
    /// the player's body land: Resilience and Nourish raise max HP, Energy adds
    /// speed, and Gratitude starts the fight behind a ward.
    /// </summary>
    public static BattleState Begin(Monster monster, int level, uint seed, Boosts? boosts = null)
    {
        Boosts carried = boosts ?? Boosts.None;
        PlayerStats stats = Progression.StatsAt(level);

        int maxHp = stats.MaxHp + Loadout.BonusHp(carried.Stats, stats.MaxHp);
        if (carried.Charges.Contains(Charge.Nourish))
        {
            maxHp += (int)Math.Round(stats.MaxHp * Charges.NourishHp, MidpointRounding.AwayFromZero);
        }
        int speed = stats.Speed + Loadout.BonusSpeed(carried.Stats);
        int ward = carried.Charges.Contains(Charge.Gratitude)
            ? (int)Math.Round(maxHp * Charges.GratitudeWard, MidpointRounding.AwayFromZero)
            : 0;

        var player = new Combatant(
            Hp: maxHp,
            MaxHp: maxHp,
            Shield: ward,
            Attack: stats.Attack,
            Defense: stats.Defense,
            Speed: speed,
            Effects: []);

        var foe = new Combatant(
            Hp: monster.Hp,
            MaxHp: monster.Hp,
            Shield: 0,
            Attack: monster.Attack,
            Defense: monster.Defense,
            Speed: monster.Speed,
            Effects: []);

        Side first = speed >= monster.Speed || carried.Charges.Contains(Charge.Balance)
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
            XpOwed: 0)
        {
            Boosts = carried,
        };
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
    /// <param name="displayName">
    /// The companion's name for the move, for the log line only. Absent means
    /// the plain name from <see cref="Actions"/>.
    /// </param>
    public static BattleState Act(BattleState state, string actionId, Monster monster, int level, string? displayName = null)
    {
        if (state.Outcome != Outcome.Fighting || state.Turn != Side.Player) return state;

        if (string.Equals(actionId, "flee", StringComparison.Ordinal)) return Flee(state, monster);

        PlayerAction? action = Actions.ById(actionId);
        if (action is null) return Say(state, Side.Player, "Nothing happens.");
        string name = string.IsNullOrWhiteSpace(displayName) ? action.Name : displayName;
        if (action.UnlockLevel > level) return Say(state, Side.Player, $"{name} is not yours yet.");

        double wobble = Rng.Wobble(state.Seed, state.Round * 3);
        BattleState next = state;

        switch (action.Type)
        {
            case ActionType.Attack:
            {
                int damage = PreviewDamage(state, action, monster, wobble);
                (Combatant foe, int dealt, int blocked) = Absorb(state.Monster, damage);
                string note = Charges.HitsWeakness(state.Boosts.Charges, monster)
                    ? " It flinches - today's logging landed."
                    : "";
                string blockNote = blocked > 0 ? $" {blocked} turned aside." : "";
                next = Say(next with { Monster = foe }, Side.Player, $"{name} hits for {dealt}.{blockNote}{note}");
                break;
            }

            case ActionType.Heal:
            {
                // Power is a percentage of maximum HP for heals, so the
                // level-4 unlock keeps its value as the island gets harder.
                double lift = Charges.StyleMultiplier(state.Boosts.Charges, action.Style, monster)
                    * Loadout.StyleMultiplier(state.Boosts.Stats, action.Style);
                int amount = Math.Max(1, (int)Math.Round(state.Player.MaxHp * (action.Power / 100.0) * lift));
                int healed = Math.Min(amount, state.Player.MaxHp - state.Player.Hp);
                next = Say(
                    next with { Player = state.Player with { Hp = state.Player.Hp + healed } },
                    Side.Player,
                    healed > 0 ? $"{name}. +{healed} back." : $"{name}. Nothing left to mend.");
                break;
            }

            case ActionType.Shield:
            {
                double lift = Charges.StyleMultiplier(state.Boosts.Charges, action.Style, monster)
                    * Loadout.StyleMultiplier(state.Boosts.Stats, action.Style);
                int ward = Math.Max(1, (int)Math.Round(action.Power * lift, MidpointRounding.AwayFromZero));
                next = Say(
                    next with { Player = state.Player with { Shield = state.Player.Shield + ward } },
                    Side.Player,
                    $"{name}. +{ward} ward.");
                break;
            }

            case ActionType.Debuff:
            {
                var effect = action.Status ?? new StatusEffect(StatusKind.AttackDown, action.Power, 1);
                next = Say(
                    next with { Monster = state.Monster with { Effects = [.. state.Monster.Effects, effect] } },
                    Side.Player,
                    $"{name} takes hold.");
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
                // A monster's second wind runs out. Without the fade, a
                // healer met under-levelled out-heals every hit it takes and
                // the fight never ends - the one bug this reducer must not have.
                double fade = Math.Max(0, 1 - ((state.Round - 1) / (double)MonsterHealFadeRounds));
                int power = (int)Math.Round(action.Power * fade, MidpointRounding.AwayFromZero);
                int healed = Math.Min(power, state.Monster.MaxHp - state.Monster.Hp);
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
    /// What one of the player's attacks would do right now, before the
    /// monster's shield and guard.
    ///
    /// Magic ignores defense and Physical does not - that is the whole
    /// difference between them. Everything else multiplies: today's charges
    /// (weakness, style, Bond) and the raid sheet.
    /// </summary>
    public static int PreviewDamage(BattleState state, PlayerAction action, Monster monster, double wobble = 1.0)
    {
        double multiplier = Charges.DamageMultiplier(state.Boosts.Charges, action.Style, monster)
            * Loadout.StyleMultiplier(state.Boosts.Stats, action.Style);
        int defense = action.Style == Style.Magic ? 0 : state.Monster.Defense;
        return Damage(
            state.Player.Attack,
            action.Power,
            defense,
            multiplier,
            wobble,
            state.Player.MagnitudeOf(StatusKind.AttackDown));
    }

    /// <summary>
    /// Hits left with the best attack available at this level, for the "is
    /// this going anywhere" read the battle log panel shows. No crits, no
    /// wobble.
    /// </summary>
    public static int HitsLeft(BattleState state, Monster monster, int level)
    {
        int perHit = Actions.UnlockedAt(level)
            .Where(a => a.Type == ActionType.Attack)
            .Select(a => PreviewDamage(state, a, monster))
            .DefaultIfEmpty(1)
            .Max();
        return (int)Math.Ceiling(state.Monster.Hp / (double)Math.Max(1, perHit));
    }
}
