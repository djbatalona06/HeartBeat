namespace HeartBeat.Game.Core.Models;

/// <summary>
/// How a monster fights, beyond what is on its stat block.
///
/// Every monster used to pick its move the same way: a seeded roll, the first
/// action half the time and the rest sharing what is left. That is
/// <see cref="Steady"/>, and it is still what most monsters do. The others give
/// the bigger fights a shape a person can read and answer - and, with
/// <see cref="Behaviours.Telegraph"/>, a warning one turn ahead for the ones that
/// can be answered.
///
/// None of them is meant to be harder than <see cref="Steady"/> on average. They
/// are meant to be <i>different</i>: the same amount of damage, delivered in
/// another rhythm. <c>BehaviourTests</c> holds that, because the island balance
/// tests were tuned against Steady and a playstyle that quietly hits twice as
/// hard would turn a wall into a surprise.
/// </summary>
public enum Behavior
{
    /// <summary>The original: a seeded pick, first action half the time.</summary>
    Steady,

    /// <summary>
    /// Two quiet rounds, then one heavy blow. The heavy one is telegraphed, so a
    /// ward raised on the turn before it is the answer.
    /// </summary>
    Bruiser,

    /// <summary>When it attacks, it strikes twice for less each. Telegraphed.</summary>
    Swarm,

    /// <summary>Raises its guard, then answers with two measured blows.</summary>
    Guardian,

    /// <summary>Lays a drain on you, then leans on it with lighter blows.</summary>
    Drainer,

    /// <summary>Hits harder when it lands, and sometimes does not.</summary>
    Trickster,

    /// <summary>Picks a hurt moment to mend itself, and only then.</summary>
    Healer,
}
