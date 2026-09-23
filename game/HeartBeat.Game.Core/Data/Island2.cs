using HeartBeat.Game.Core.Models;

namespace HeartBeat.Game.Core.Data;

/// <summary>
/// Island 2 - Kitchen Grove, and its dark face, Craving Cavern.
///
/// The axis is nourishment, so every monster here is weak to
/// <see cref="Element.Nourishment"/>: a Nourish charge - eating something
/// proper today - is what makes them flinch. The residents are a kitchen
/// garden's worth of friendly spirits, from a seed that has not sprouted yet
/// to the oven that bakes for everyone.
///
/// Same seven-stage shape as <see cref="Island1"/>, and the same stat curve
/// scaled to this island's level band (entered at 5, boss at 12);
/// <c>IslandTests</c> holds both ends for every island.
/// </summary>
public static class Island2
{
    public static readonly Island Value = new(
        Number: 2,
        LightName: "Kitchen Grove",
        DarkName: "Craving Cavern",
        Element: Element.Nourishment,
        Stages:
        [
            new Stage(1, "The Orchard Gate", new Monster(
                Id: "i2s1-pipkin",
                Name: "Pipkin",
                Type: MonsterType.Common,
                Hp: 98, Attack: 7, Defense: 4, Speed: 3,
                Weakness: Element.Nourishment, Strength: Element.Rest,
                Actions:
                [
                    new MonsterAction("Seed Toss", 5, Element.Movement, ActionType.Attack),
                    new MonsterAction("Sugar Slump", 0, Element.Rest, ActionType.Debuff,
                        new StatusEffect(StatusKind.SpeedDown, 50, 1)),
                ],
                SpriteKey: "pipkin",
                Theme: DioramaTheme.Light)),

            new Stage(2, "Honey Row", new Monster(
                Id: "i2s2-buzzbun",
                Name: "Buzzbun",
                Type: MonsterType.Common,
                Hp: 137, Attack: 16, Defense: 6, Speed: 5,
                Weakness: Element.Nourishment, Strength: Element.Focus,
                Actions:
                [
                    new MonsterAction("Buzz", 7, Element.Movement, ActionType.Attack),
                    new MonsterAction("Wax Shell", 0, Element.Focus, ActionType.Shield,
                        new StatusEffect(StatusKind.Guard, 30, 2)),
                ],
                SpriteKey: "buzzbun",
                Theme: DioramaTheme.Light)),

            new Stage(3, "The Spice Rack", new Monster(
                Id: "i2s3-pepperwisp",
                Name: "Pepperwisp",
                Type: MonsterType.Common,
                Hp: 208, Attack: 18, Defense: 9, Speed: 7,
                Weakness: Element.Nourishment, Strength: Element.Mood,
                Actions:
                [
                    new MonsterAction("Pepper Pop", 9, Element.Movement, ActionType.Attack),
                    new MonsterAction("Sneeze Cloud", 0, Element.Mood, ActionType.Debuff,
                        new StatusEffect(StatusKind.AttackDown, 25, 2)),
                ],
                SpriteKey: "pepperwisp",
                Theme: DioramaTheme.Light)),

            new Stage(4, "The Long Table", new Monster(
                Id: "i2s4-auntie-crumble",
                Name: "Auntie Crumble",
                Type: MonsterType.SemiBoss,
                Hp: 228, Attack: 25, Defense: 8, Speed: 4,
                Weakness: Element.Nourishment, Strength: Element.Movement,
                Actions:
                [
                    new MonsterAction("Crust Slam", 11, Element.Movement, ActionType.Attack),
                    new MonsterAction("Second Helping", 0, Element.Movement, ActionType.Debuff,
                        new StatusEffect(StatusKind.SpeedDown, 50, 2)),
                    new MonsterAction("Warm Leftovers", 35, Element.Movement, ActionType.Heal),
                ],
                SpriteKey: "auntie-crumble",
                Theme: DioramaTheme.Light)),

            new Stage(5, "Melon Patch", new Monster(
                Id: "i2s5-rindroll",
                Name: "Rindroll",
                Type: MonsterType.Common,
                Hp: 121, Attack: 19, Defense: 4, Speed: 9,
                Weakness: Element.Nourishment, Strength: Element.Rest,
                Actions:
                [
                    new MonsterAction("Rolling Rind", 8, Element.Movement, ActionType.Attack),
                ],
                SpriteKey: "rindroll",
                Theme: DioramaTheme.Light)),

            new Stage(6, "The Cold Pantry", new Monster(
                Id: "i2s6-frostcrate",
                Name: "Frostcrate Golem",
                Type: MonsterType.Elite,
                Hp: 319, Attack: 26, Defense: 11, Speed: 4,
                Weakness: Element.Nourishment, Strength: Element.Focus,
                Actions:
                [
                    new MonsterAction("Lid Slam", 13, Element.Focus, ActionType.Attack),
                    new MonsterAction("Seal Tight", 0, Element.Focus, ActionType.Shield,
                        new StatusEffect(StatusKind.Guard, 40, 2)),
                    new MonsterAction("Frost Nip", 0, Element.Nourishment, ActionType.Debuff,
                        new StatusEffect(StatusKind.Drain, 6, 3)),
                ],
                SpriteKey: "frostcrate",
                Theme: DioramaTheme.Light)),

            new Stage(7, "The Great Oven", new Monster(
                Id: "i2s7-mother-marzipan",
                Name: "Mother Marzipan",
                Type: MonsterType.Boss,
                Hp: 496, Attack: 26, Defense: 9, Speed: 5,
                Weakness: Element.Nourishment, Strength: Element.Mood,
                Actions:
                [
                    new MonsterAction("Rolling Pin", 15, Element.Mood, ActionType.Attack),
                    new MonsterAction("Crust Wall", 0, Element.Mood, ActionType.Shield,
                        new StatusEffect(StatusKind.Guard, 50, 2)),
                    new MonsterAction("Sugar Crash", 0, Element.Nourishment, ActionType.Debuff,
                        new StatusEffect(StatusKind.Drain, 8, 3)),
                ],
                SpriteKey: "mother-marzipan",
                Theme: DioramaTheme.Light)),
        ]);

    /// <summary>What each stage's monster is called on the island's dark face.</summary>
    public static readonly IReadOnlyDictionary<string, string> DarkNames =
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["i2s1-pipkin"] = "Hollow Pipkin",
            ["i2s2-buzzbun"] = "Sticky Buzzbun",
            ["i2s3-pepperwisp"] = "Scorch Pepperwisp",
            ["i2s4-auntie-crumble"] = "The Stale Crumble",
            ["i2s5-rindroll"] = "Overripe Rindroll",
            ["i2s6-frostcrate"] = "Freezer-Burnt Frostcrate",
            ["i2s7-mother-marzipan"] = "The Hollow Marzipan",
        };
}
