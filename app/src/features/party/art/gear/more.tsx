/**
 * Fifteen more drawings, for the fifteen pieces added when the world grew to ten
 * islands: three to each slot, between rare and mythic. Same rules as the rest —
 * flat shapes in the theme's own `--color-text`, `--color-accent` and
 * `--color-text-muted`, one idea each, drawn in a 100×100 box.
 */

const Svg = ({ children }: { children: React.ReactNode }) => (
  <svg viewBox="0 0 100 100" aria-hidden="true" className="gear-art">{children}</svg>
);

const text = 'var(--color-text)';
const accent = 'var(--color-accent)';
const muted = 'var(--color-text-muted)';

/** Helmet, epic. Up before the first drop and down after the last. */
export function RainHood() {
  return (
    <Svg>
      <path d="M22 76 Q22 20 50 20 Q78 20 78 76 L64 76 Q64 40 50 40 Q36 40 36 76 Z" fill={text} />
      <path d="M50 20 Q50 12 58 10" fill="none" stroke={muted} strokeWidth="3" strokeLinecap="round" />
      <path d="M84 22 Q89 31 84 36 Q79 31 84 22 Z M16 40 Q20 47 16 51 Q12 47 16 40 Z" fill={accent} />
    </Svg>
  );
}

/** Helmet, legendary. Comes on at dusk exactly when it is needed, never earlier. */
export function Streetlamp() {
  return (
    <Svg>
      <circle cx="50" cy="32" r="26" fill={accent} opacity="0.18" />
      <rect x="48" y="40" width="4" height="46" fill={text} />
      <path d="M34 40 L66 40 L59 22 L41 22 Z" fill={text} />
      <circle cx="50" cy="31" r="6" fill={accent} />
      <path d="M38 86 L62 86" stroke={text} strokeWidth="4" strokeLinecap="round" />
    </Svg>
  );
}

/** Helmet, mythic. The hush before anybody says it is snowing. */
export function FirstSnow() {
  return (
    <Svg>
      <g stroke={text} strokeWidth="4" strokeLinecap="round">
        <path d="M50 18 L50 82" />
        <path d="M22.3 34 L77.7 66" />
        <path d="M22.3 66 L77.7 34" />
      </g>
      <g fill={accent}>
        <circle cx="50" cy="16" r="4" /><circle cx="50" cy="84" r="4" />
        <circle cx="21" cy="33" r="4" /><circle cx="79" cy="67" r="4" />
        <circle cx="21" cy="67" r="4" /><circle cx="79" cy="33" r="4" />
      </g>
      <circle cx="50" cy="50" r="7" fill={text} />
    </Svg>
  );
}

/** Weapon, epic. Cuts back what was never going to flower. */
export function GardenShears() {
  return (
    <Svg>
      <g fill={text}>
        <path d="M46 12 L54 12 L58 56 L42 56 Z" transform="rotate(-18 50 56)" />
        <path d="M46 12 L54 12 L58 56 L42 56 Z" transform="rotate(18 50 56)" />
      </g>
      <circle cx="50" cy="56" r="3.5" fill={muted} />
      <g stroke={accent} strokeWidth="6" strokeLinecap="round" fill="none">
        <path d="M44 62 Q30 72 36 86" />
        <path d="M56 62 Q70 72 64 86" />
      </g>
    </Svg>
  );
}

/** Weapon, legendary. Sweeps the dark once a minute, never in a hurry. */
export function LighthouseBeam() {
  return (
    <Svg>
      <path d="M8 22 L44 31 L44 39 L8 52 Z M92 22 L56 31 L56 39 L92 52 Z" fill={accent} opacity="0.4" />
      <path d="M40 88 L45 40 L55 40 L60 88 Z" fill={text} />
      <path d="M44 40 L50 26 L56 40 Z" fill={text} />
      <rect x="44" y="30" width="12" height="9" fill={accent} />
      <path d="M32 88 L68 88" stroke={text} strokeWidth="4" strokeLinecap="round" />
      <path d="M46 56 L54 56 M45 68 L55 68" stroke={muted} strokeWidth="3" />
    </Svg>
  );
}

/** Weapon, mythic. Sent before the argument had finished, and it ended it. */
export function KindReply() {
  return (
    <Svg>
      <path d="M14 26 Q14 18 22 18 L78 18 Q86 18 86 26 L86 56 Q86 64 78 64 L58 64 L44 80 L44 64 L22 64 Q14 64 14 56 Z" fill={text} />
      <path d="M50 54 C36 44 38 32 45 32 C48 32 50 34 50 36 C50 34 52 32 55 32 C62 32 64 44 50 54 Z" fill={accent} />
    </Svg>
  );
}

/** Chestplate, rare. Buttoned wrong by one, and nobody has mentioned it. */
export function Cardigan() {
  return (
    <Svg>
      <path d="M30 20 L42 15 L50 28 L58 15 L70 20 L86 46 L76 54 L70 47 L70 86 L30 86 L30 47 L24 54 L14 46 Z" fill={text} />
      <path d="M50 28 L50 86" stroke={muted} strokeWidth="2.5" />
      <g fill={accent}>
        <circle cx="45" cy="42" r="3.2" /><circle cx="45" cy="58" r="3.2" /><circle cx="45" cy="74" r="3.2" />
      </g>
      <circle cx="57" cy="50" r="3.2" fill={accent} opacity="0.55" />
    </Svg>
  );
}

/** Chestplate, epic. Smells faintly of rope, and of the day nothing went wrong. */
export function HarbourJacket() {
  return (
    <Svg>
      <path d="M28 20 L42 14 L50 26 L58 14 L72 20 L88 48 L77 56 L71 48 L71 88 L29 88 L29 48 L23 56 L12 48 Z" fill={text} />
      <path d="M42 14 L50 36 L58 14" fill="none" stroke={muted} strokeWidth="3" strokeLinejoin="round" />
      <path d="M29 62 L71 62 M29 72 L71 72" stroke={accent} strokeWidth="4" />
      <path d="M50 36 L50 88" stroke={muted} strokeWidth="2.5" />
    </Svg>
  );
}

/** Chestplate, legendary. Carries the evening's fire home in the lining. */
export function WoodsmokeCoat() {
  return (
    <Svg>
      <g fill="none" stroke={accent} strokeWidth="3.5" strokeLinecap="round" opacity="0.75">
        <path d="M42 16 Q35 10 42 4" />
        <path d="M52 18 Q45 12 52 6" />
        <path d="M62 16 Q69 10 62 4" />
      </g>
      <path d="M30 28 L43 23 L50 36 L57 23 L70 28 L80 90 L20 90 Z" fill={text} />
      <path d="M50 36 L50 90" stroke={muted} strokeWidth="2.5" />
      <path d="M26 82 L74 82" stroke={accent} strokeWidth="4" />
    </Svg>
  );
}

/** Boots, rare. Left by the back door, always facing out. */
export function GardenClogs() {
  return (
    <Svg>
      <path d="M20 56 Q20 34 40 34 L60 34 L60 52 Q84 54 86 68 L86 76 L20 76 Z" fill={text} />
      <path d="M20 70 L86 70" stroke={muted} strokeWidth="3" />
      <ellipse cx="40" cy="48" rx="9" ry="4.5" transform="rotate(-30 40 48)" fill={accent} />
    </Svg>
  );
}

/** Boots, epic. Takes the long way, and you let it. */
export function NightBus() {
  return (
    <Svg>
      <rect x="12" y="30" width="76" height="40" rx="8" fill={text} />
      <g fill={accent}>
        <rect x="19" y="38" width="13" height="12" rx="2" /><rect x="36" y="38" width="13" height="12" rx="2" />
        <rect x="53" y="38" width="13" height="12" rx="2" /><rect x="70" y="38" width="12" height="12" rx="2" />
      </g>
      <path d="M12 58 L88 58" stroke={muted} strokeWidth="3" />
      <circle cx="30" cy="72" r="7" fill={muted} /><circle cx="70" cy="72" r="7" fill={muted} />
    </Svg>
  );
}

/** Boots, legendary. Narrow, windy, and the only way anybody considered. */
export function CoastalPath() {
  return (
    <Svg>
      <path d="M22 88 Q46 74 38 56 Q30 38 52 30 Q66 24 74 8" fill="none" stroke={text} strokeWidth="11" strokeLinecap="round" />
      <path d="M22 88 Q46 74 38 56 Q30 38 52 30 Q66 24 74 8" fill="none" stroke={accent} strokeWidth="2.5" strokeDasharray="6 7" strokeLinecap="round" />
      <path d="M72 70 Q80 66 88 70 M76 80 Q84 76 92 80" fill="none" stroke={muted} strokeWidth="3" strokeLinecap="round" />
    </Svg>
  );
}

/** Amulet, rare. Twelve tracks, labelled in a hand you would know anywhere. */
export function Mixtape() {
  return (
    <Svg>
      <rect x="12" y="28" width="76" height="46" rx="6" fill={text} />
      <rect x="22" y="34" width="56" height="16" rx="2" fill={accent} />
      <circle cx="36" cy="62" r="6.5" fill={muted} /><circle cx="64" cy="62" r="6.5" fill={muted} />
      <path d="M30 42 L70 42" stroke={text} strokeWidth="2" opacity="0.6" />
      <path d="M40 74 L44 68 L56 68 L60 74" fill="none" stroke={muted} strokeWidth="2.5" />
    </Svg>
  );
}

/** Amulet, epic. Points the wrong way on purpose, towards home. */
export function BrassCompass() {
  return (
    <Svg>
      <circle cx="50" cy="52" r="34" fill="none" stroke={text} strokeWidth="6" />
      <path d="M50 8 L50 20 M50 84 L50 96 M6 52 L18 52 M82 52 L94 52" stroke={text} strokeWidth="4" strokeLinecap="round" />
      <path d="M50 52 L58 52 L50 24 L42 52 Z" fill={accent} />
      <path d="M50 52 L58 52 L50 80 L42 52 Z" fill={text} />
      <circle cx="50" cy="52" r="4" fill={muted} />
    </Svg>
  );
}

/** Amulet, legendary. Slightly overexposed. Neither of you would change it. */
export function Polaroid() {
  return (
    <Svg>
      <rect x="18" y="12" width="64" height="76" rx="3" fill={text} />
      <rect x="25" y="19" width="50" height="46" fill={accent} opacity="0.45" />
      <circle cx="40" cy="34" r="7" fill={accent} />
      <path d="M25 65 L25 55 Q38 44 52 54 Q64 46 75 55 L75 65 Z" fill={muted} />
      <path d="M32 77 L58 77" stroke={muted} strokeWidth="3" strokeLinecap="round" />
    </Svg>
  );
}
