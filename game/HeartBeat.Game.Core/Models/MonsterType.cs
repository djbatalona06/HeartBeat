namespace HeartBeat.Game.Core.Models;

/// <summary>
/// What a monster is for, within its island's seven stages.
///
/// The tier decides the XP payout (<see cref="Progression.XpForDefeating"/>)
/// and nothing else. Stats are authored per monster rather than derived from
/// the tier, because a stage-6 Elite and a stage-4 SemiBoss are meant to feel
/// different in kind, not just in size.
/// </summary>
public enum MonsterType
{
    Common,
    SemiBoss,
    Elite,
    Boss,
}
