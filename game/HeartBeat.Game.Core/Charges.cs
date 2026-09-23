using HeartBeat.Game.Core.Models;

namespace HeartBeat.Game.Core;

/// <summary>
/// What today's logging is worth in a fight.
///
/// A charge is one kind of log that happened today - a workout, a study
/// session, a mood, a night's rest - plus the two nobody can log alone: Bond
/// (both of you logged) and Balance (three different kinds of log). TypeScript
/// works out which are lit and hands them over; this table is the only place
/// that says what each one does.
///
/// Two rules hold everything here together:
///
/// * <b>A charge only ever helps.</b> A fight with no charges is the fight the
///   island was balanced for, and <c>IslandTests</c> proves every stage is
///   winnable that way. Logging makes it easier; not logging never makes it
///   harder.
/// * <b>The island's element is still the answer.</b> A charge whose element is
///   the monster's weakness makes every hit land at
///   <see cref="Battle.WeaknessMultiplier"/>. Stuck on Morning Meadow? Go for a
///   walk, and the next fight knows.
/// </summary>
public enum Charge
{
    Exercise,
    Work,
    Mood,
    Rest,
    Gratitude,
    Nourish,
    Bond,
    Balance,
}

public static class Charges
{
    /// <summary>How much a charge lifts the move style it feeds.</summary>
    public const double StyleBonus = 0.25;

    /// <summary>Rest feeds Mend, and a heal is worth more when you have actually slept.</summary>
    public const double MendBonus = 0.5;

    /// <summary>Bond's lift on every hit. Small, because it is on everything.</summary>
    public const double BondBonus = 0.1;

    /// <summary>Gratitude opens the fight with a ward this big, as a share of max HP.</summary>
    public const double GratitudeWard = 0.1;

    /// <summary>Nourish raises max HP for the fight by this share.</summary>
    public const double NourishHp = 0.15;

    public static Element ElementOf(Charge charge) => charge switch
    {
        Charge.Exercise => Element.Movement,
        Charge.Work => Element.Focus,
        Charge.Mood => Element.Mood,
        Charge.Rest => Element.Rest,
        Charge.Gratitude => Element.Mood,
        Charge.Nourish => Element.Nourishment,
        Charge.Bond => Element.Bond,
        Charge.Balance => Element.Balance,
        _ => Element.Mood,
    };

    /// <summary>The move style a charge feeds, if it feeds one.</summary>
    public static Style? StyleOf(Charge charge) => charge switch
    {
        Charge.Exercise => Style.Physical,
        Charge.Work => Style.Magic,
        Charge.Mood => Style.Defensive,
        Charge.Rest => Style.Mend,
        _ => null,
    };

    /// <summary>True when any charge hits what the monster is weak to.</summary>
    public static bool HitsWeakness(IReadOnlyList<Charge> charges, Monster monster) =>
        charges.Any(c => ElementOf(c) == monster.Weakness);

    /// <summary>
    /// The multiplier today's charges put on one move style.
    ///
    /// A charge whose element the monster is strong against gives half its
    /// bonus - "it shrugs part of that off" - and never less than none, which
    /// is the rule that stops a log from ever costing anything.
    /// </summary>
    public static double StyleMultiplier(IReadOnlyList<Charge> charges, Style style, Monster monster)
    {
        double multiplier = 1.0;
        foreach (Charge charge in charges.Distinct())
        {
            if (StyleOf(charge) != style) continue;
            double bonus = charge == Charge.Rest ? MendBonus : StyleBonus;
            if (ElementOf(charge) == monster.Strength) bonus /= 2;
            multiplier *= 1 + bonus;
        }
        return multiplier;
    }

    /// <summary>Everything that multiplies a hit, charges-wise, in one number.</summary>
    public static double DamageMultiplier(IReadOnlyList<Charge> charges, Style style, Monster monster)
    {
        double weakness = HitsWeakness(charges, monster) ? Battle.WeaknessMultiplier : 1.0;
        double bond = charges.Contains(Charge.Bond) ? 1 + BondBonus : 1.0;
        return weakness * bond * StyleMultiplier(charges, style, monster);
    }

    /// <summary>Parse the comma-separated list TypeScript sends. Unknown names are dropped.</summary>
    public static IReadOnlyList<Charge> Parse(string? csv)
    {
        if (string.IsNullOrWhiteSpace(csv)) return [];
        return csv.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(s => Enum.TryParse(s, ignoreCase: true, out Charge c) ? (Charge?)c : null)
            .Where(c => c is not null)
            .Select(c => c!.Value)
            .Distinct()
            .ToList();
    }
}
