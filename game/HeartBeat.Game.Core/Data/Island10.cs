using HeartBeat.Game.Core.Models;

namespace HeartBeat.Game.Core.Data;

/// <summary>
/// Island 10 - Zenith Falls, and its dark face, Fogbound Falls.
///
/// The far end of the world: the same axis and the same seven-stage shape as
/// <see cref="Island3"/>, fought at ranks 37 to 44 against monsters
/// that are Island 3's own, grown to match the player at that rank. The
/// seven elements are reused rather than extended: the type chart has seven
/// rows because the app has seven things worth logging, and a new island is
/// a harder visit to one of them, not an eighth.
/// </summary>
public static class Island10
{
    public static readonly Island Value = new(
        Number: 10,
        LightName: "Zenith Falls",
        DarkName: "Fogbound Falls",
        Element: Element.Focus,
        Stages:
        [
            new Stage(1, "The Far Spray Line", new Monster(
                Id: "i10s1-driplet",
                Name: "Elder Driplet",
                Type: MonsterType.Common,
                Hp: 1637, Attack: 217, Defense: 73, Speed: 7,
                Weakness: Element.Focus, Strength: Element.Rest,
                Actions:
                [
                    new MonsterAction("Splash", 5, Element.Movement, ActionType.Attack),
                    new MonsterAction("Lull", 0, Element.Rest, ActionType.Debuff,
                        new StatusEffect(StatusKind.SpeedDown, 50, 1)),
                ],
                SpriteKey: "driplet-elder",
                Theme: DioramaTheme.Light)),

            new Stage(2, "Far Stepping Stones", new Monster(
                Id: "i10s2-pebblenook",
                Name: "Elder Pebblenook",
                Type: MonsterType.Common,
                Hp: 2498, Attack: 289, Defense: 103, Speed: 11,
                Weakness: Element.Focus, Strength: Element.Mood,
                Actions:
                [
                    new MonsterAction("Skip Stone", 7, Element.Movement, ActionType.Attack),
                    new MonsterAction("Stone Skin", 0, Element.Mood, ActionType.Shield,
                        new StatusEffect(StatusKind.Guard, 30, 2)),
                ],
                SpriteKey: "pebblenook-elder",
                Theme: DioramaTheme.Light)),

            new Stage(3, "The Far Whirlpool", new Monster(
                Id: "i10s3-eddywhirl",
                Name: "Elder Eddywhirl",
                Type: MonsterType.Common,
                Hp: 3616, Attack: 376, Defense: 149, Speed: 16,
                Weakness: Element.Focus, Strength: Element.Movement,
                Actions:
                [
                    new MonsterAction("Spin", 9, Element.Movement, ActionType.Attack),
                    new MonsterAction("Dizzy Mist", 0, Element.Movement, ActionType.Debuff,
                        new StatusEffect(StatusKind.AttackDown, 25, 2)),
                ],
                SpriteKey: "eddywhirl-elder",
                Theme: DioramaTheme.Light)),

            new Stage(4, "The Far Chattering Rapids", new Monster(
                Id: "i10s4-pingwing",
                Name: "Elder Pingwing",
                Type: MonsterType.SemiBoss,
                Hp: 4324, Attack: 491, Defense: 161, Speed: 10,
                Weakness: Element.Focus, Strength: Element.Mood,
                Actions:
                [
                    new MonsterAction("Ping", 11, Element.Mood, ActionType.Attack),
                    new MonsterAction("Just One More", 0, Element.Mood, ActionType.Debuff,
                        new StatusEffect(StatusKind.SpeedDown, 50, 2)),
                    new MonsterAction("Refresh", 657, Element.Mood, ActionType.Heal),
                ],
                SpriteKey: "pingwing-elder",
                Theme: DioramaTheme.Light)),

            new Stage(5, "Far Quiet Pool", new Monster(
                Id: "i10s5-lilypad-imp",
                Name: "Elder Lilypad Imp",
                Type: MonsterType.Common,
                Hp: 2526, Attack: 420, Defense: 87, Speed: 20,
                Weakness: Element.Focus, Strength: Element.Rest,
                Actions:
                [
                    new MonsterAction("Hop", 8, Element.Movement, ActionType.Attack),
                ],
                SpriteKey: "lilypad-imp-elder",
                Theme: DioramaTheme.Light)),

            new Stage(6, "The Far Mill Wheel", new Monster(
                Id: "i10s6-gristmill",
                Name: "Elder Gristmill Golem",
                Type: MonsterType.Elite,
                Hp: 6974, Attack: 579, Defense: 248, Speed: 10,
                Weakness: Element.Focus, Strength: Element.Nourishment,
                Actions:
                [
                    new MonsterAction("Grind", 13, Element.Nourishment, ActionType.Attack),
                    new MonsterAction("Lock Gears", 0, Element.Nourishment, ActionType.Shield,
                        new StatusEffect(StatusKind.Guard, 40, 2)),
                    new MonsterAction("Idle Churn", 0, Element.Nourishment, ActionType.Debuff,
                        new StatusEffect(StatusKind.Drain, 130, 3)),
                ],
                SpriteKey: "gristmill-elder",
                Theme: DioramaTheme.Light)),

            new Stage(7, "The Far Top of the Falls", new Monster(
                Id: "i10s7-cascade-warden",
                Name: "The Elder Cascade Warden",
                Type: MonsterType.Boss,
                Hp: 10384, Attack: 593, Defense: 206, Speed: 11,
                Weakness: Element.Focus, Strength: Element.Rest,
                Actions:
                [
                    new MonsterAction("Torrent", 15, Element.Rest, ActionType.Attack),
                    new MonsterAction("Mist Veil", 0, Element.Rest, ActionType.Shield,
                        new StatusEffect(StatusKind.Guard, 50, 2)),
                    new MonsterAction("Wander Off", 0, Element.Nourishment, ActionType.Debuff,
                        new StatusEffect(StatusKind.Drain, 188, 3)),
                ],
                SpriteKey: "cascade-warden-elder",
                Theme: DioramaTheme.Light)),
        ]);

    /// <summary>What each stage's monster is called on the island's dark face.</summary>
    public static readonly IReadOnlyDictionary<string, string> DarkNames =
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["i10s1-driplet"] = "Elder Murk Driplet",
            ["i10s2-pebblenook"] = "Elder Mossy Pebblenook",
            ["i10s3-eddywhirl"] = "Elder Fog Eddy",
            ["i10s4-pingwing"] = "The Elder Endless Pingwing",
            ["i10s5-lilypad-imp"] = "Elder Sunken Lilypad",
            ["i10s6-gristmill"] = "Elder Rusted Gristmill",
            ["i10s7-cascade-warden"] = "The Elder Fogbound Warden",
        };
}
