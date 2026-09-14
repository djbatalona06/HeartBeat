namespace HeartBeat.Game.Core;

/// <summary>
/// Deterministic numbers, ported verbatim from <c>app/src/domain/hash.ts</c>.
///
/// This is a second implementation of a function that already exists in
/// TypeScript, which is normally the kind of duplicate `hash.ts` itself warns
/// about - its own doc comment explains that it exists because a second copy of
/// FNV-1a "is the kind of duplicate that drifts". The copy is deliberate
/// anyway, for one reason: a fight resolved in C# has to replay identically to
/// the same fight described by a TypeScript log, and the only way to get that
/// is the same arithmetic on both sides.
///
/// What keeps it from drifting is <c>RngTests.MatchesTypeScript</c>, which pins
/// these functions against values captured from the TypeScript original. If
/// someone edits `hash.ts`, that test fails here and says so.
///
/// The arithmetic is fiddlier in C# than in JS because JavaScript's
/// <c>Math.imul</c> is a 32-bit multiply with wraparound and C#'s <c>*</c> is
/// not, and because <c>&gt;&gt;&gt;</c> has no C# spelling. <c>uint</c> gives
/// wraparound multiplication and a logical right shift for free, so every
/// intermediate here is <c>uint</c> and the casts are where the two languages
/// disagree, not where the algorithm does.
/// </summary>
public static class Rng
{
    /// <summary>A stable 32-bit hash (FNV-1a). Mirrors <c>hash(text)</c>.</summary>
    public static uint Hash(string text)
    {
        uint h = 2166136261u;
        foreach (char c in text)
        {
            h ^= c;
            h *= 16777619u;
        }
        return h;
    }

    /// <summary>
    /// A number in [0, 1) from a seed and a step. Mirrors <c>roll(seed, step)</c>.
    ///
    /// <paramref name="step"/> is the caller's counter - a battle passes its
    /// round number, so round three rolls the same whether it is played now or
    /// replayed from the log tomorrow.
    /// </summary>
    public static double Roll(uint seed, int step)
    {
        uint h = seed ^ unchecked((uint)(step + 1) * 2654435761u);
        h = (h ^ (h >> 15)) * 2246822507u;
        h = (h ^ (h >> 13)) * 3266489909u;
        return (h ^ (h >> 16)) / 4294967296.0;
    }

    /// <summary>
    /// The wobble either side of a flat power value, as a multiplier.
    ///
    /// <c>Variance</c> matches <c>encounter.ts</c>'s VARIANCE so that a swing in
    /// Eve's Garden lands in the same range a swing in the old overworld did.
    /// </summary>
    public const double Variance = 0.2;

    public static double Wobble(uint seed, int step) => 1 + ((Roll(seed, step) * 2) - 1) * Variance;
}
