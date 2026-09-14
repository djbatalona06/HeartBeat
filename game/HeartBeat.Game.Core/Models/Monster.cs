namespace HeartBeat.Game.Core.Models;

/// <summary>
/// One stage's opponent, already resolved to a single diorama variant.
///
/// Authored light-side in <c>Data/</c>; <see cref="Forged"/> is what produces
/// the dark-side copy. Nothing constructs a Monster with a
/// <see cref="DioramaTheme.Dark"/> theme by hand, so the dark stat bump exists
/// in exactly one place and a test can pin it.
/// </summary>
public sealed record Monster(
    string Id,
    string Name,
    MonsterType Type,
    int Hp,
    int Attack,
    int Defense,
    int Speed,
    Element Weakness,
    Element Strength,
    IReadOnlyList<MonsterAction> Actions,
    string SpriteKey,
    DioramaTheme Theme)
{
    /// <summary>
    /// How much harder the dark variant of an island hits.
    ///
    /// 25%, and chosen to be felt rather than feared: at stage 1 that is HP 30
    /// to 37 and attack 5 to 6. `Island1Tests.DarkVariantStaysBeatable` pins
    /// the upper end - a dark boss must still lose to a level-appropriate
    /// player, because the dark variant reflects a hard week and a hard week is
    /// the worst possible time to make the game unwinnable.
    /// </summary>
    public const double DarkScale = 1.25;

    /// <summary>
    /// The same monster wearing the other face of its island.
    ///
    /// Authored monsters are always <see cref="DioramaTheme.Light"/>, and this
    /// scales from that baseline. Calling it with the theme the monster already
    /// has returns it untouched, so forging twice cannot scale twice - the one
    /// way this could silently produce a monster nobody authored.
    /// </summary>
    public Monster Forged(DioramaTheme theme, string? darkName = null)
    {
        if (theme == Theme) return this;
        if (theme == DioramaTheme.Light) return this with { Theme = DioramaTheme.Light };

        static int Up(int value) => (int)Math.Round(value * DarkScale, MidpointRounding.AwayFromZero);

        return this with
        {
            Name = darkName ?? Name,
            Hp = Up(Hp),
            Attack = Up(Attack),
            Defense = Up(Defense),
            // Speed is deliberately untouched. Turn order is the one thing the
            // player can read off the screen and plan around; shifting it under
            // them on a bad week would make the dark variant feel unfair rather
            // than heavy.
            Theme = DioramaTheme.Dark,
        };
    }
}
