using HeartBeat.Game.Core.Models;

namespace HeartBeat.Game.Core.Data;

/// <summary>
/// Island 7 - Heartwood Summit, and its dark face, The Hollow Crown.
///
/// The last island, and its axis is everything at once: every monster here is
/// weak to <see cref="Element.Balance"/>, which lights when three different
/// kinds of log land on the same day. The whole tree, root to crown.
///
/// Same seven-stage shape as <see cref="Island1"/>, and the same stat curve
/// scaled to this island's level band (entered at 25, boss at 32);
/// <c>IslandTests</c> holds both ends for every island.
/// </summary>
public static class Island7
{
    public static readonly Island Value = new(
        Number: 7,
        LightName: "Heartwood Summit",
        DarkName: "The Hollow Crown",
        Element: Element.Balance,
        Stages:
        [
            new Stage(1, "The Root Stair", new Monster(
                Id: "i7s1-rootling",
                Name: "Rootling",
                Type: MonsterType.Common,
                Hp: 327, Attack: 43, Defense: 16, Speed: 7,
                Weakness: Element.Balance, Strength: Element.Mood,
                Actions:
                [
                    new MonsterAction("Root Poke", 5, Element.Movement, ActionType.Attack),
                    new MonsterAction("Heavy Bark", 0, Element.Mood, ActionType.Debuff,
                        new StatusEffect(StatusKind.SpeedDown, 50, 1)),
                ],
                SpriteKey: "rootling",
                Theme: DioramaTheme.Light)),

            new Stage(2, "Lantern Canopy", new Monster(
                Id: "i7s2-acornet",
                Name: "Acornet",
                Type: MonsterType.Common,
                Hp: 490, Attack: 56, Defense: 22, Speed: 9,
                Weakness: Element.Balance, Strength: Element.Rest,
                Actions:
                [
                    new MonsterAction("Acorn Drop", 7, Element.Movement, ActionType.Attack),
                    new MonsterAction("Husk", 0, Element.Rest, ActionType.Shield,
                        new StatusEffect(StatusKind.Guard, 30, 2)),
                ],
                SpriteKey: "acornet",
                Theme: DioramaTheme.Light)),

            new Stage(3, "The Sap Spring", new Monster(
                Id: "i7s3-sapsprite",
                Name: "Sapsprite",
                Type: MonsterType.Common,
                Hp: 688, Attack: 71, Defense: 30, Speed: 12,
                Weakness: Element.Balance, Strength: Element.Focus,
                Actions:
                [
                    new MonsterAction("Sticky Shot", 9, Element.Movement, ActionType.Attack),
                    new MonsterAction("Resin Haze", 0, Element.Focus, ActionType.Debuff,
                        new StatusEffect(StatusKind.AttackDown, 25, 2)),
                ],
                SpriteKey: "sapsprite",
                Theme: DioramaTheme.Light)),

            new Stage(4, "The Split Oak", new Monster(
                Id: "i7s4-twin-oak",
                Name: "The Twin Oak",
                Type: MonsterType.SemiBoss,
                Hp: 802, Attack: 90, Defense: 30, Speed: 9,
                Weakness: Element.Balance, Strength: Element.Movement,
                Actions:
                [
                    new MonsterAction("Branch Slam", 11, Element.Movement, ActionType.Attack),
                    new MonsterAction("Creak", 0, Element.Movement, ActionType.Debuff,
                        new StatusEffect(StatusKind.SpeedDown, 50, 2)),
                    new MonsterAction("Regrow", 125, Element.Movement, ActionType.Heal),
                ],
                SpriteKey: "twin-oak",
                Theme: DioramaTheme.Light)),

            new Stage(5, "Leaf Loft", new Monster(
                Id: "i7s5-leaflit",
                Name: "Leaflit",
                Type: MonsterType.Common,
                Hp: 454, Attack: 75, Defense: 14, Speed: 14,
                Weakness: Element.Balance, Strength: Element.Nourishment,
                Actions:
                [
                    new MonsterAction("Leaf Blade", 8, Element.Movement, ActionType.Attack),
                ],
                SpriteKey: "leaflit",
                Theme: DioramaTheme.Light)),

            new Stage(6, "The Ring Hall", new Monster(
                Id: "i7s6-heartwood-golem",
                Name: "Heartwood Golem",
                Type: MonsterType.Elite,
                Hp: 1223, Attack: 102, Defense: 44, Speed: 9,
                Weakness: Element.Balance, Strength: Element.Rest,
                Actions:
                [
                    new MonsterAction("Trunk Slam", 13, Element.Rest, ActionType.Attack),
                    new MonsterAction("Bark Up", 0, Element.Rest, ActionType.Shield,
                        new StatusEffect(StatusKind.Guard, 40, 2)),
                    new MonsterAction("Dry Rot", 0, Element.Nourishment, ActionType.Debuff,
                        new StatusEffect(StatusKind.Drain, 24, 3)),
                ],
                SpriteKey: "heartwood-golem",
                Theme: DioramaTheme.Light)),

            new Stage(7, "The Crown of the Tree", new Monster(
                Id: "i7s7-heartwood-crown",
                Name: "The Heartwood Crown",
                Type: MonsterType.Boss,
                Hp: 1865, Attack: 102, Defense: 36, Speed: 10,
                Weakness: Element.Balance, Strength: Element.Bond,
                Actions:
                [
                    new MonsterAction("Canopy Crash", 15, Element.Bond, ActionType.Attack),
                    new MonsterAction("Ring of Years", 0, Element.Bond, ActionType.Shield,
                        new StatusEffect(StatusKind.Guard, 50, 2)),
                    new MonsterAction("All at Once", 0, Element.Nourishment, ActionType.Debuff,
                        new StatusEffect(StatusKind.Drain, 32, 3)),
                ],
                SpriteKey: "heartwood-crown",
                Theme: DioramaTheme.Light)),
        ]);

    /// <summary>What each stage's monster is called on the island's dark face.</summary>
    public static readonly IReadOnlyDictionary<string, string> DarkNames =
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["i7s1-rootling"] = "Withered Rootling",
            ["i7s2-acornet"] = "Hollow Acornet",
            ["i7s3-sapsprite"] = "Sour Sapsprite",
            ["i7s4-twin-oak"] = "The Riven Oak",
            ["i7s5-leaflit"] = "Brittle Leaflit",
            ["i7s6-heartwood-golem"] = "Hollow Heartwood",
            ["i7s7-heartwood-crown"] = "The Hollow King",
        };
}
