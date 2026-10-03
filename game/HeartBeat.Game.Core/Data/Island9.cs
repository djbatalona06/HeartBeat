using HeartBeat.Game.Core.Models;

namespace HeartBeat.Game.Core.Data;

/// <summary>
/// Island 9 - Harvest Terrace, and its dark face, Famine Hollow.
///
/// The far end of the world: the same axis and the same seven-stage shape as
/// <see cref="Island2"/>, fought at ranks 33 to 40 against monsters
/// that are Island 2's own, grown to match the player at that rank. The
/// seven elements are reused rather than extended: the type chart has seven
/// rows because the app has seven things worth logging, and a new island is
/// a harder visit to one of them, not an eighth.
/// </summary>
public static class Island9
{
    public static readonly Island Value = new(
        Number: 9,
        LightName: "Harvest Terrace",
        DarkName: "Famine Hollow",
        Element: Element.Nourishment,
        Stages:
        [
            new Stage(1, "The Deep Orchard Gate", new Monster(
                Id: "i9s1-pipkin",
                Name: "Elder Pipkin",
                Type: MonsterType.Common,
                Hp: 1143, Attack: 100, Defense: 47, Speed: 6,
                Weakness: Element.Nourishment, Strength: Element.Rest,
                Actions:
                [
                    new MonsterAction("Seed Toss", 5, Element.Movement, ActionType.Attack),
                    new MonsterAction("Sugar Slump", 0, Element.Rest, ActionType.Debuff,
                        new StatusEffect(StatusKind.SpeedDown, 50, 1)),
                ],
                SpriteKey: "pipkin-elder",
                Theme: DioramaTheme.Light)),

            new Stage(2, "Deep Honey Row", new Monster(
                Id: "i9s2-buzzbun",
                Name: "Elder Buzzbun",
                Type: MonsterType.Common,
                Hp: 1758, Attack: 251, Defense: 77, Speed: 10,
                Weakness: Element.Nourishment, Strength: Element.Focus,
                Actions:
                [
                    new MonsterAction("Buzz", 7, Element.Movement, ActionType.Attack),
                    new MonsterAction("Wax Shell", 0, Element.Focus, ActionType.Shield,
                        new StatusEffect(StatusKind.Guard, 30, 2)),
                ],
                SpriteKey: "buzzbun-elder",
                Theme: DioramaTheme.Light)),

            new Stage(3, "The Deep Spice Rack", new Monster(
                Id: "i9s3-pepperwisp",
                Name: "Elder Pepperwisp",
                Type: MonsterType.Common,
                Hp: 2516, Attack: 310, Defense: 109, Speed: 15,
                Weakness: Element.Nourishment, Strength: Element.Mood,
                Actions:
                [
                    new MonsterAction("Pepper Pop", 9, Element.Movement, ActionType.Attack),
                    new MonsterAction("Sneeze Cloud", 0, Element.Mood, ActionType.Debuff,
                        new StatusEffect(StatusKind.AttackDown, 25, 2)),
                ],
                SpriteKey: "pepperwisp-elder",
                Theme: DioramaTheme.Light)),

            new Stage(4, "The Deep Long Table", new Monster(
                Id: "i9s4-auntie-crumble",
                Name: "Elder Auntie Crumble",
                Type: MonsterType.SemiBoss,
                Hp: 3029, Attack: 328, Defense: 106, Speed: 9,
                Weakness: Element.Nourishment, Strength: Element.Movement,
                Actions:
                [
                    new MonsterAction("Crust Slam", 11, Element.Movement, ActionType.Attack),
                    new MonsterAction("Second Helping", 0, Element.Movement, ActionType.Debuff,
                        new StatusEffect(StatusKind.SpeedDown, 50, 2)),
                    new MonsterAction("Warm Leftovers", 465, Element.Movement, ActionType.Heal),
                ],
                SpriteKey: "auntie-crumble-elder",
                Theme: DioramaTheme.Light)),

            new Stage(5, "Deep Melon Patch", new Monster(
                Id: "i9s5-rindroll",
                Name: "Elder Rindroll",
                Type: MonsterType.Common,
                Hp: 1769, Attack: 274, Defense: 58, Speed: 20,
                Weakness: Element.Nourishment, Strength: Element.Rest,
                Actions:
                [
                    new MonsterAction("Rolling Rind", 8, Element.Movement, ActionType.Attack),
                ],
                SpriteKey: "rindroll-elder",
                Theme: DioramaTheme.Light)),

            new Stage(6, "The Deep Cold Pantry", new Monster(
                Id: "i9s6-frostcrate",
                Name: "Elder Frostcrate Golem",
                Type: MonsterType.Elite,
                Hp: 4908, Attack: 390, Defense: 176, Speed: 9,
                Weakness: Element.Nourishment, Strength: Element.Focus,
                Actions:
                [
                    new MonsterAction("Lid Slam", 13, Element.Focus, ActionType.Attack),
                    new MonsterAction("Seal Tight", 0, Element.Focus, ActionType.Shield,
                        new StatusEffect(StatusKind.Guard, 40, 2)),
                    new MonsterAction("Frost Nip", 0, Element.Nourishment, ActionType.Debuff,
                        new StatusEffect(StatusKind.Drain, 87, 3)),
                ],
                SpriteKey: "frostcrate-elder",
                Theme: DioramaTheme.Light)),

            new Stage(7, "The Deep Great Oven", new Monster(
                Id: "i9s7-mother-marzipan",
                Name: "Elder Mother Marzipan",
                Type: MonsterType.Boss,
                Hp: 7693, Attack: 391, Defense: 134, Speed: 10,
                Weakness: Element.Nourishment, Strength: Element.Mood,
                Actions:
                [
                    new MonsterAction("Rolling Pin", 15, Element.Mood, ActionType.Attack),
                    new MonsterAction("Crust Wall", 0, Element.Mood, ActionType.Shield,
                        new StatusEffect(StatusKind.Guard, 50, 2)),
                    new MonsterAction("Sugar Crash", 0, Element.Nourishment, ActionType.Debuff,
                        new StatusEffect(StatusKind.Drain, 116, 3)),
                ],
                SpriteKey: "mother-marzipan-elder",
                Theme: DioramaTheme.Light)),
        ]);

    /// <summary>What each stage's monster is called on the island's dark face.</summary>
    public static readonly IReadOnlyDictionary<string, string> DarkNames =
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["i9s1-pipkin"] = "Elder Hollow Pipkin",
            ["i9s2-buzzbun"] = "Elder Sticky Buzzbun",
            ["i9s3-pepperwisp"] = "Elder Scorch Pepperwisp",
            ["i9s4-auntie-crumble"] = "The Elder Stale Crumble",
            ["i9s5-rindroll"] = "Elder Overripe Rindroll",
            ["i9s6-frostcrate"] = "Elder Freezer-Burnt Frostcrate",
            ["i9s7-mother-marzipan"] = "The Elder Hollow Marzipan",
        };
}
