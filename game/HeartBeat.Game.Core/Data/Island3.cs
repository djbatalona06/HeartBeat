using HeartBeat.Game.Core.Models;

namespace HeartBeat.Game.Core.Data;

/// <summary>
/// Island 3 - Focus Falls, and its dark face, Fog Marsh.
///
/// The axis is focus, so every monster here is weak to
/// <see cref="Element.Focus"/>: an hour of study or deep work logged today
/// is what cuts through them. Water spirits all the way up the falls, and a
/// semi-boss that will not stop chiming.
///
/// Same seven-stage shape as <see cref="Island1"/>, and the same stat curve
/// scaled to this island's level band (entered at 9, boss at 16);
/// <c>IslandTests</c> holds both ends for every island.
/// </summary>
public static class Island3
{
    public static readonly Island Value = new(
        Number: 3,
        LightName: "Focus Falls",
        DarkName: "Fog Marsh",
        Element: Element.Focus,
        Stages:
        [
            new Stage(1, "The Spray Line", new Monster(
                Id: "i3s1-driplet",
                Name: "Driplet",
                Type: MonsterType.Common,
                Hp: 112, Attack: 15, Defense: 5, Speed: 3,
                Weakness: Element.Focus, Strength: Element.Rest,
                Actions:
                [
                    new MonsterAction("Splash", 5, Element.Movement, ActionType.Attack),
                    new MonsterAction("Lull", 0, Element.Rest, ActionType.Debuff,
                        new StatusEffect(StatusKind.SpeedDown, 50, 1)),
                ],
                SpriteKey: "driplet",
                Theme: DioramaTheme.Light)),

            new Stage(2, "Stepping Stones", new Monster(
                Id: "i3s2-pebblenook",
                Name: "Pebblenook",
                Type: MonsterType.Common,
                Hp: 163, Attack: 19, Defense: 7, Speed: 5,
                Weakness: Element.Focus, Strength: Element.Mood,
                Actions:
                [
                    new MonsterAction("Skip Stone", 7, Element.Movement, ActionType.Attack),
                    new MonsterAction("Stone Skin", 0, Element.Mood, ActionType.Shield,
                        new StatusEffect(StatusKind.Guard, 30, 2)),
                ],
                SpriteKey: "pebblenook",
                Theme: DioramaTheme.Light)),

            new Stage(3, "The Whirlpool", new Monster(
                Id: "i3s3-eddywhirl",
                Name: "Eddywhirl",
                Type: MonsterType.Common,
                Hp: 233, Attack: 25, Defense: 10, Speed: 8,
                Weakness: Element.Focus, Strength: Element.Movement,
                Actions:
                [
                    new MonsterAction("Spin", 9, Element.Movement, ActionType.Attack),
                    new MonsterAction("Dizzy Mist", 0, Element.Movement, ActionType.Debuff,
                        new StatusEffect(StatusKind.AttackDown, 25, 2)),
                ],
                SpriteKey: "eddywhirl",
                Theme: DioramaTheme.Light)),

            new Stage(4, "The Chattering Rapids", new Monster(
                Id: "i3s4-pingwing",
                Name: "Pingwing",
                Type: MonsterType.SemiBoss,
                Hp: 275, Attack: 31, Defense: 10, Speed: 5,
                Weakness: Element.Focus, Strength: Element.Mood,
                Actions:
                [
                    new MonsterAction("Ping", 11, Element.Mood, ActionType.Attack),
                    new MonsterAction("Just One More", 0, Element.Mood, ActionType.Debuff,
                        new StatusEffect(StatusKind.SpeedDown, 50, 2)),
                    new MonsterAction("Refresh", 42, Element.Mood, ActionType.Heal),
                ],
                SpriteKey: "pingwing",
                Theme: DioramaTheme.Light)),

            new Stage(5, "Quiet Pool", new Monster(
                Id: "i3s5-lilypad-imp",
                Name: "Lilypad Imp",
                Type: MonsterType.Common,
                Hp: 157, Attack: 26, Defense: 5, Speed: 10,
                Weakness: Element.Focus, Strength: Element.Rest,
                Actions:
                [
                    new MonsterAction("Hop", 8, Element.Movement, ActionType.Attack),
                ],
                SpriteKey: "lilypad-imp",
                Theme: DioramaTheme.Light)),

            new Stage(6, "The Mill Wheel", new Monster(
                Id: "i3s6-gristmill",
                Name: "Gristmill Golem",
                Type: MonsterType.Elite,
                Hp: 423, Attack: 35, Defense: 15, Speed: 5,
                Weakness: Element.Focus, Strength: Element.Nourishment,
                Actions:
                [
                    new MonsterAction("Grind", 13, Element.Nourishment, ActionType.Attack),
                    new MonsterAction("Lock Gears", 0, Element.Nourishment, ActionType.Shield,
                        new StatusEffect(StatusKind.Guard, 40, 2)),
                    new MonsterAction("Idle Churn", 0, Element.Nourishment, ActionType.Debuff,
                        new StatusEffect(StatusKind.Drain, 8, 3)),
                ],
                SpriteKey: "gristmill",
                Theme: DioramaTheme.Light)),

            new Stage(7, "The Top of the Falls", new Monster(
                Id: "i3s7-cascade-warden",
                Name: "The Cascade Warden",
                Type: MonsterType.Boss,
                Hp: 610, Attack: 35, Defense: 12, Speed: 6,
                Weakness: Element.Focus, Strength: Element.Rest,
                Actions:
                [
                    new MonsterAction("Torrent", 15, Element.Rest, ActionType.Attack),
                    new MonsterAction("Mist Veil", 0, Element.Rest, ActionType.Shield,
                        new StatusEffect(StatusKind.Guard, 50, 2)),
                    new MonsterAction("Wander Off", 0, Element.Nourishment, ActionType.Debuff,
                        new StatusEffect(StatusKind.Drain, 11, 3)),
                ],
                SpriteKey: "cascade-warden",
                Theme: DioramaTheme.Light)),
        ]);

    /// <summary>What each stage's monster is called on the island's dark face.</summary>
    public static readonly IReadOnlyDictionary<string, string> DarkNames =
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["i3s1-driplet"] = "Murk Driplet",
            ["i3s2-pebblenook"] = "Mossy Pebblenook",
            ["i3s3-eddywhirl"] = "Fog Eddy",
            ["i3s4-pingwing"] = "The Endless Pingwing",
            ["i3s5-lilypad-imp"] = "Sunken Lilypad",
            ["i3s6-gristmill"] = "Rusted Gristmill",
            ["i3s7-cascade-warden"] = "The Fogbound Warden",
        };
}
