namespace HeartBeat.Game.Core.Models;

public enum Side { Player, Monster }

public enum Outcome
{
    Fighting,

    /// <summary>The monster is down. The stage is cleared.</summary>
    Won,

    /// <summary>
    /// The player is down.
    ///
    /// Called <c>Down</c> rather than <c>Lost</c>, following the ruling in
    /// <c>encounter.ts</c>: nothing that outlives a fight is spent inside one,
    /// so there is nothing to lose. The stage is simply still there.
    /// </summary>
    Down,

    /// <summary>The player walked away. The stage is still there too.</summary>
    Fled,
}

/// <summary>One side's fighting condition. Nothing here outlives the battle.</summary>
public sealed record Combatant(
    int Hp,
    int MaxHp,
    int Shield,
    int Attack,
    int Defense,
    int Speed,
    IReadOnlyList<StatusEffect> Effects)
{
    public double HpFraction => MaxHp <= 0 ? 0 : Math.Clamp(Hp / (double)MaxHp, 0, 1);

    public int MagnitudeOf(StatusKind kind) =>
        Effects.Where(e => e.Kind == kind).Sum(e => e.Magnitude);

    public bool Has(StatusKind kind) => Effects.Any(e => e.Kind == kind);
}

/// <summary>One line of the battle log.</summary>
public sealed record BattleLine(int Round, Side Who, string Text);

/// <summary>
/// A whole fight, as a value.
///
/// Every field is either fixed at the start or derived from the actions taken
/// since, which is what makes <c>Battle.Act</c> a pure function and a fight
/// replayable from its log. Nothing in here is written to a database: the
/// TypeScript side holds the current state in React and drops it when the
/// overlay unmounts.
/// </summary>
public sealed record BattleState(
    string MonsterId,
    int Round,
    Side Turn,
    Combatant Player,
    Combatant Monster,
    IReadOnlyList<BattleLine> Log,
    Outcome Outcome,
    uint Seed,
    /// <summary>XP banked by this fight so far, for the TypeScript side to pay out.</summary>
    int XpOwed);
