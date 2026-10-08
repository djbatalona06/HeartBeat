using HeartBeat.Game.Core.Models;

namespace HeartBeat.Game.Core;

/// <summary>What a monster means to do on its coming turn.</summary>
/// <param name="Action">Null means it does nothing this round - it gathers itself.</param>
/// <param name="Scale">Multiplies each hit of an attack.</param>
/// <param name="Hits">How many separate hits an attack makes.</param>
/// <param name="Misses">The attack is thrown and does not land.</param>
/// <param name="Telegraph">
/// What the player is warned of before it happens, or null for a move that
/// carries no warning: <c>heavy</c>, <c>flurry</c>, <c>guard</c>, <c>drain</c>
/// or <c>mend</c>.
/// </param>
public readonly record struct MonsterPlan(
    MonsterAction? Action,
    double Scale = 1.0,
    int Hits = 1,
    bool Misses = false,
    string? Telegraph = null);

/// <summary>
/// How each <see cref="Behavior"/> chooses and shapes the monster's turn.
///
/// ## Pure, and nothing remembered
///
/// The reducer keeps no per-monster state, so every rule here is a function of
/// the round number, the monster's HP and the battle's seed. That is the same
/// constraint the rest of <see cref="Battle"/> lives under, and it is why a
/// rhythm is written as <c>(Round - 1) % 3</c> rather than "the turn after the
/// last one".
///
/// It is also what lets <see cref="Telegraph"/> exist at all. The plan for the
/// coming turn is a function of state that already exists on the player's turn,
/// so the warning is exact rather than a guess: the move that is announced is the
/// move that is played, because they are the same call.
///
/// ## Kept near the same total damage
///
/// A Steady monster spends half its turns on its first attack and some of the
/// rest on a drain, which is a good deal more than a first guess at "half a hit
/// a round". The scales below were measured rather than reasoned - mean damage
/// to the player per round against the same monster on Steady, across all 30
/// fights that carry a behaviour, `BehaviourTests.EveryPlaystyleDealsAboutAsMuchAsSteady`
/// - and land within about 15% of it either way. That is what keeps the
/// winnability the island tests proved for Steady true for the others.
/// </summary>
public static class Behaviours
{
    /// <summary>Mixes the battle seed so a miss does not reuse the damage roll.</summary>
    private const uint MissSalt = 0xA5A5A5A5u;

    /// <summary>The chance a Trickster's attack misses; its hits are scaled to match.</summary>
    public const double TricksterMissChance = 0.15;

    private const double TricksterHitScale = 1.1;
    private const double BruiserHeavyScale = 1.35;
    private const double BruiserJabScale = 0.65;
    private const double GuardianBlowScale = 1.0;
    private const double DrainerBlowScale = 0.65;

    /// <summary>The two halves of a Swarm's flurry, each a little over half so the total holds.</summary>
    private const double SwarmHitScale = 0.5;

    /// <summary>A Healer mends itself below this share of its health.</summary>
    private const double HealerHurtFraction = 0.5;

    /// <summary>Position in the three-round rhythm: 0, 1 or 2.</summary>
    private static int Phase(BattleState state) => (Math.Max(1, state.Round) - 1) % 3;

    private static MonsterAction? FirstOf(Monster monster, ActionType type) =>
        monster.Actions.FirstOrDefault(a => a.Type == type);

    private static MonsterAction? DrainOf(Monster monster) =>
        monster.Actions.FirstOrDefault(a => a.Status is { Kind: StatusKind.Drain });

    /// <summary>The original pick: a seeded roll, the first action half the time.</summary>
    private static MonsterAction Steady(BattleState state, Monster monster)
    {
        double pick = Rng.Roll(state.Seed, state.Round * 3 + 2);
        int index = pick < 0.5 ? 0 : 1 + (int)(((pick - 0.5) / 0.5) * (monster.Actions.Count - 1));
        return monster.Actions[Math.Clamp(index, 0, monster.Actions.Count - 1)];
    }

    /// <summary>
    /// The monster's coming turn, for this state. Never null for a monster with
    /// actions; <see cref="Battle.MonsterMove"/> handles one with none.
    /// </summary>
    public static MonsterPlan Plan(BattleState state, Monster monster)
    {
        MonsterAction steady = Steady(state, monster);
        MonsterAction? attack = FirstOf(monster, ActionType.Attack);
        int phase = Phase(state);

        switch (monster.Behavior)
        {
            case Behavior.Bruiser when attack is not null:
                // Gather, jab, strike. The first round is a defensive or crippling
                // move when it has one, the second a light jab, and the third the
                // heavy blow - telegraphed, so a ward on the turn before it is the
                // answer. A heavy blow with nothing in between was far spikier than
                // the average it was meant to match.
                if (phase == 2) return new MonsterPlan(attack, BruiserHeavyScale, Telegraph: "heavy");
                if (phase == 1) return new MonsterPlan(attack, BruiserJabScale);
                return new MonsterPlan(monster.Actions.FirstOrDefault(a => a.Type != ActionType.Attack && a.Type != ActionType.Heal));

            case Behavior.Swarm when steady.Type == ActionType.Attack:
                return new MonsterPlan(steady, SwarmHitScale, Hits: 2, Telegraph: "flurry");

            case Behavior.Guardian when attack is not null:
                if (phase == 0)
                {
                    MonsterAction ward = monster.Actions.FirstOrDefault(a => a.Type == ActionType.Shield)
                        ?? new MonsterAction("Brace", 0, monster.Strength, ActionType.Shield,
                            new StatusEffect(StatusKind.Guard, 40, 2));
                    return new MonsterPlan(ward, Telegraph: "guard");
                }
                return new MonsterPlan(attack, GuardianBlowScale);

            case Behavior.Drainer when attack is not null && DrainOf(monster) is { } drain:
                return phase == 0
                    ? new MonsterPlan(drain, Telegraph: "drain")
                    : new MonsterPlan(attack, DrainerBlowScale);

            case Behavior.Trickster when steady.Type == ActionType.Attack:
            {
                bool misses = Rng.Roll(state.Seed ^ MissSalt, state.Round) < TricksterMissChance;
                return new MonsterPlan(steady, TricksterHitScale, Misses: misses);
            }

            case Behavior.Healer:
            {
                MonsterAction? heal = FirstOf(monster, ActionType.Heal);
                bool hurt = state.Monster.HpFraction < HealerHurtFraction;
                if (heal is not null && hurt && state.Round % 2 == 0) return new MonsterPlan(heal, Telegraph: "mend");
                return new MonsterPlan(steady, Telegraph: steady.Type == ActionType.Heal ? "mend" : null);
            }

            default:
                return new MonsterPlan(steady);
        }
    }

    /// <summary>
    /// What the player is warned of before the monster's coming turn, or null.
    ///
    /// The same call <see cref="Battle.MonsterMove"/> makes, so what is announced
    /// is exactly what is played. Null once the fight is over.
    /// </summary>
    public static string? Telegraph(BattleState state, Monster monster) =>
        state.Outcome == Outcome.Fighting && monster.Actions.Count > 0
            ? Plan(state, monster).Telegraph
            : null;
}
