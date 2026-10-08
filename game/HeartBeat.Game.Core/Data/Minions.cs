using HeartBeat.Game.Core.Models;

namespace HeartBeat.Game.Core.Data;

/// <summary>
/// The small enemies that wander islands 5 and up: two a island, optional, and
/// never a stage.
///
/// **Derived, not authored.** Each is a shrunken copy of the island's own stage
/// 1 and stage 2 common, so the island's stat curve - and the coupling between
/// that curve and the player's, which <c>IslandTests</c> holds - is inherited
/// rather than re-tuned by hand. Change a stage's numbers and its skirmish
/// follows; <c>MinionTests</c> still checks every one is far weaker than what it
/// is a copy of and still winnable.
///
/// **Addressed like a stage.** A skirmish is <c>(island, 101)</c> or
/// <c>(island, 102)</c>: stage numbers above <see cref="StageBase"/>. That is
/// what lets a fight carry which one it is with no new field, and what keeps
/// them out of every list of real stages (<see cref="World.StageFor"/> returns
/// null for them, so nothing counts them toward clearing an island). Their ids
/// start with <c>m</c>, never the <c>i&lt;island&gt;s&lt;stage&gt;-</c> shape
/// the TypeScript side reads progress from, so beating one cannot move it.
///
/// They reuse the parent's sprite: the board draws them smaller, which is what
/// makes them read as small without another dozen drawings.
/// </summary>
public static class Minions
{
    /// <summary>Stage numbers above this are skirmishes.</summary>
    public const int StageBase = 100;

    /// <summary>How many skirmishes an island has.</summary>
    public const int PerIsland = 2;

    /// <summary>The first island that has any.</summary>
    public const int FirstIsland = 5;

    /// <summary>The skirmish's size against its parent. Hit points and attack are scaled from it.</summary>
    private const double HpShare = 0.25;
    private const double AttackShare = 0.6;
    private const double DefenseShare = 0.5;

    public static bool IsMinionStage(int stage) => stage > StageBase && stage <= StageBase + PerIsland;

    /// <summary>The skirmish's index, 1 or 2.</summary>
    public static int IndexOf(int stage) => stage - StageBase;

    /// <summary>The stage this skirmish is a shrunken copy of: stage 1 or stage 2 of the same island.</summary>
    public static Monster? ParentOf(int island, int stage)
    {
        if (island < FirstIsland || !IsMinionStage(stage)) return null;
        return World.StageFor(island, IndexOf(stage))?.Monster;
    }

    /// <summary>"Little " and a name: how a skirmish is called, in either face.</summary>
    public static string Named(string parentName) => $"Little {parentName}";

    public static Monster? For(int island, int stage)
    {
        Monster? parent = ParentOf(island, stage);
        if (parent is null) return null;

        static int Of(int value, double share) =>
            Math.Max(1, (int)Math.Round(value * share, MidpointRounding.AwayFromZero));

        return parent with
        {
            Id = $"m{island}k{IndexOf(stage)}-{parent.SpriteKey}",
            Name = Named(parent.Name),
            Type = MonsterType.Minion,
            Hp = Of(parent.Hp, HpShare),
            Attack = Of(parent.Attack, AttackShare),
            Defense = Of(parent.Defense, DefenseShare),
            // Its first move only: the plain hit. The parent's debuffs and shields
            // are what make the stage a stage.
            Actions = [parent.Actions[0]],
            Behavior = Behavior.Steady,
        };
    }
}
