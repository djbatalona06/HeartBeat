namespace HeartBeat.Game.Core.Models;

/// <summary>What an action does when it resolves.</summary>
public enum ActionType
{
    /// <summary>Deals damage, scaled by the element chart.</summary>
    Attack,

    /// <summary>Applies a <see cref="StatusEffect"/> to the other side.</summary>
    Debuff,

    /// <summary>Restores HP to the actor, never above its maximum.</summary>
    Heal,

    /// <summary>Adds shield to the actor. Shield absorbs before HP does.</summary>
    Shield,
}
