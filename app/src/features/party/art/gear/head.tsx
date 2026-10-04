import { EDGE, GLINT, SHADE, Star, Svg, accent, base, muted, shadow, text } from './kit';

/**
 * The eight helmets, drawn to the kit in `kit.tsx`. Each is one idea from its
 * name and blurb, in the order of the ladder: the common one is paper and tape,
 * the mythic ones are an ordinary evening made large.
 */

/** Helmet, common. Folded from paper, uneven points, a crayon squiggle on the band. */
export function PaperCrown() {
  return (
    <Svg>
      <path d="M16 72 L16 38 L31 54 L42 26 L53 53 L64 22 L74 52 L84 36 L84 72 Z" fill={text} {...EDGE} />
      {/* The folded-back face of each point. */}
      <path d="M42 26 L53 53 L46 72 L40 72 Z M64 22 L74 52 L68 72 L60 72 Z M84 36 L84 72 L78 72 L77 50 Z" {...SHADE} />
      <rect x="16" y="62" width="68" height="10" rx="2" fill={muted} {...EDGE} />
      <path d="M22 67 q4 -5 8 0 t8 0 t8 0 t8 0 t8 0 t8 0" fill="none" stroke={accent} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M40 31 L32 48 M62 27 L55 46" {...GLINT} />
    </Svg>
  );
}

/** Helmet, rare. A headband with a bow tied on the left. */
export function RedRibbon() {
  return (
    <Svg>
      <path d="M12 66 A38 28 0 0 1 88 66" fill="none" stroke={text} strokeWidth="8" strokeLinecap="round" />
      <path d="M16 66 A34 24 0 0 1 84 66" fill="none" stroke={shadow} strokeWidth="2" strokeLinecap="round" opacity="0.3" />
      {/* Two tails, then two loops, then the knot. */}
      <path d="M28 52 L19 80 L28 73 L33 82 L35 54 Z" fill={accent} {...EDGE} />
      <path d="M30 47 C14 28 6 44 13 57 C20 62 28 56 30 47 Z" fill={accent} {...EDGE} />
      <path d="M30 47 C46 28 54 44 47 57 C40 62 32 56 30 47 Z" fill={accent} {...EDGE} />
      <path d="M30 47 C46 28 54 44 47 57 C40 62 32 56 30 47 Z M35 54 L33 82 L28 73 L30 60 Z" {...SHADE} />
      <circle cx="30" cy="48" r="6" fill={accent} {...EDGE} />
      <circle cx="30" cy="48" r="6" {...SHADE} opacity="0.12" />
      <path d="M15 45 C15 39 19 36 24 36 M24 49 L21 71" {...GLINT} />
    </Svg>
  );
}

/** Helmet, epic. A thin circlet, three stars above it joined by faint lines. */
export function StargazerCirclet() {
  return (
    <Svg>
      <path d="M26 34 L50 22 L74 34" fill="none" stroke={muted} strokeWidth="1.6" strokeDasharray="3 3" opacity="0.8" />
      <path d="M26 34 L26 47 M50 22 L50 40 M74 34 L74 47" fill="none" stroke={muted} strokeWidth="1.4" strokeDasharray="2 3" opacity="0.6" />
      <path d="M12 68 A38 28 0 0 1 88 68" fill="none" stroke={text} strokeWidth="6.5" strokeLinecap="round" />
      <path d="M15 68 A35 25 0 0 1 85 68" fill="none" stroke={shadow} strokeWidth="1.8" strokeLinecap="round" opacity="0.3" />
      <path d="M50 38 L55 44 L50 50 L45 44 Z" fill={accent} {...EDGE} />
      <Star cx={26} cy={34} r={6} />
      <Star cx={50} cy={22} r={8.5} />
      <Star cx={74} cy={34} r={6} />
      <g fill={muted}>
        <circle cx="38" cy="16" r="1.5" /><circle cx="64" cy="14" r="1.5" /><circle cx="88" cy="26" r="1.5" />
      </g>
      <path d="M20 58 L28 51" {...GLINT} />
    </Svg>
  );
}

/** Helmet, epic. Up before the first drop and down after the last. */
export function RainHood() {
  return (
    <Svg>
      <path d="M18 80 Q14 26 50 18 Q86 26 82 80 L66 80 Q68 46 50 40 Q32 46 34 80 Z" fill={text} {...EDGE} />
      {/* The shaded rim of the opening, and the seam over the crown. The opening
          itself stays a hole: any translucent fill in it is lit by the toon
          filter as part of the silhouette and shows as a pale blob. */}
      <path d="M34 80 Q32 46 50 40 Q68 46 66 80 L58 80 Q60 54 50 50 Q40 54 42 80 Z" {...SHADE} opacity="0.4" />
      <path d="M50 18 L50 40" stroke={shadow} strokeWidth="1.6" strokeDasharray="3 2.4" opacity="0.5" fill="none" />
      <path d="M40 31 Q44 24 52 22" {...GLINT} />
      {/* Drawcord with its two toggles. */}
      <path d="M36 66 Q32 78 37 90 M64 66 Q68 78 63 90" fill="none" stroke={muted} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="37" cy="91" r="3.2" fill={accent} {...EDGE} /><circle cx="63" cy="91" r="3.2" fill={accent} {...EDGE} />
      <g fill={accent} {...EDGE} strokeWidth={1}>
        <path d="M86 20 Q91 29 86 34 Q81 29 86 20 Z" />
        <path d="M13 36 Q17 43 13 47 Q9 43 13 36 Z" />
        <path d="M90 50 Q93 55 90 58 Q87 55 90 50 Z" />
      </g>
    </Svg>
  );
}

/** Helmet, legendary. Comes on at dusk exactly when it is needed, and never earlier. */
export function Streetlamp() {
  return (
    <Svg>
      <path d="M36 62 L64 62 L82 94 L18 94 Z" fill={accent} opacity="0.13" />
      <circle cx="50" cy="40" r="28" fill={accent} opacity="0.16" />
      <path d="M29 34 L50 14 L71 34 Z" fill={text} {...EDGE} />
      <path d="M50 14 L71 34 L58 34 Z" {...SHADE} />
      <circle cx="50" cy="11" r="3.2" fill={text} {...EDGE} />
      <path d="M34 34 L66 34 L62 62 L38 62 Z" fill={accent} {...EDGE} />
      <path d="M50 34 L50 62 M42 34 L41 62 M58 34 L59 62" stroke={text} strokeWidth="2" opacity="0.85" fill="none" />
      <path d="M36 40 L36 56" {...GLINT} />
      <rect x="35" y="62" width="30" height="6" rx="2" fill={text} {...EDGE} />
      <rect x="46" y="68" width="8" height="22" fill={text} {...EDGE} />
      <rect x="50" y="68" width="4" height="22" {...SHADE} />
      <path d="M36 91 Q50 85 64 91" fill="none" stroke={text} strokeWidth="4" strokeLinecap="round" />
    </Svg>
  );
}

/** Helmet, legendary. A veil of four bands draped from a headband. */
export function AuroraVeil() {
  const band = (x: number, fill: string, opacity: number, sway: number) => (
    <path
      d={`M${x - 7} 46 Q${x - 7 + sway} 62 ${x - 3} 76 Q${x - 2 - sway} 86 ${x - 4} 92 L${x + 8} 92 `
        + `Q${x + 6 - sway} 80 ${x + 9} 68 Q${x + 12 + sway} 54 ${x + 7} 46 Z`}
      fill={fill}
      opacity={opacity}
    />
  );
  return (
    <Svg>
      {band(24, accent, 0.85, 5)}
      {band(42, muted, 0.55, -5)}
      {band(58, accent, 0.65, 5)}
      {band(76, muted, 0.5, -5)}
      <path d="M12 52 A38 26 0 0 1 88 52" fill="none" stroke={text} strokeWidth="6" strokeLinecap="round" />
      <path d="M15 52 A35 23 0 0 1 85 52" fill="none" stroke={shadow} strokeWidth="1.8" strokeLinecap="round" opacity="0.3" />
      <path d="M26 56 Q31 66 27 76 M60 56 Q64 66 61 76" {...GLINT} />
      <Star cx={14} cy={30} r={3.4} /><Star cx={50} cy={20} r={4.6} /><Star cx={86} cy={32} r={3.4} />
    </Svg>
  );
}

/** Helmet, mythic. Left on for somebody who is still out; the halo is the ring above it. */
export function PorchLight() {
  return (
    <Svg>
      <circle cx="50" cy="60" r="36" fill={accent} opacity="0.12" />
      <circle cx="50" cy="60" r="23" fill={accent} opacity="0.22" />
      <ellipse cx="50" cy="18" rx="27" ry="7.5" fill="none" stroke={accent} strokeWidth="5" />
      <ellipse cx="50" cy="18" rx="27" ry="7.5" fill="none" stroke={base} strokeWidth="1.6" opacity="0.5" />
      <path d="M50 25 L50 38" stroke={text} strokeWidth="3.4" strokeLinecap="round" />
      <path d="M33 54 Q33 36 50 36 Q67 36 67 54 Z" fill={text} {...EDGE} />
      <path d="M50 36 Q67 36 67 54 L58 54 Q58 42 50 38 Z" {...SHADE} />
      <circle cx="50" cy="62" r="12" fill={accent} {...EDGE} />
      <path d="M43 58 Q44 54 48 53" {...GLINT} />
      {/* The cage round the bulb, and the path it lights. */}
      <path d="M38 56 Q50 80 62 56 M44 54 Q40 74 50 75 Q60 74 56 54" fill="none" stroke={text} strokeWidth="2" opacity="0.8" />
      <path d="M34 78 L66 78" stroke={text} strokeWidth="3.4" strokeLinecap="round" />
      <ellipse cx="50" cy="90" rx="26" ry="4.4" fill={accent} opacity="0.2" />
      {/* A moth, as there always is. */}
      <g fill={muted} opacity="0.9">
        <ellipse cx="78" cy="46" rx="6" ry="3.2" transform="rotate(-24 78 46)" />
        <ellipse cx="86" cy="49" rx="6" ry="3.2" transform="rotate(20 86 49)" />
      </g>
      <path d="M81 45 L83 52" stroke={text} strokeWidth="1.6" strokeLinecap="round" />
    </Svg>
  );
}

/** Helmet, mythic. The hush before anybody says it has started. */
export function FirstSnow() {
  const arm = 'M50 44 L50 10 M50 29 L42 21 M50 29 L58 21 M50 20 L45 14 M50 20 L55 14';
  return (
    <Svg>
      <path d="M12 90 Q32 76 50 83 Q70 74 88 90 Z" fill={muted} opacity="0.5" {...EDGE} strokeOpacity={0.25} />
      <path d="M18 88 Q34 80 48 85" {...GLINT} />
      <g stroke={text} strokeWidth="3" strokeLinecap="round" fill="none">
        {[0, 60, 120, 180, 240, 300].map((deg) => (
          <path key={deg} d={arm} transform={`rotate(${deg} 50 44)`} />
        ))}
      </g>
      <g fill={accent} {...EDGE} strokeWidth={0.8}>
        {[0, 60, 120, 180, 240, 300].map((deg) => (
          <circle key={deg} cx="50" cy="9" r="2.8" transform={`rotate(${deg} 50 44)`} />
        ))}
      </g>
      <path d="M50 37 L56 40.5 L56 47.5 L50 51 L44 47.5 L44 40.5 Z" fill={accent} {...EDGE} />
      <g fill={muted} opacity="0.8">
        <circle cx="20" cy="22" r="1.8" /><circle cx="82" cy="18" r="1.8" />
        <circle cx="88" cy="56" r="1.6" /><circle cx="12" cy="58" r="1.6" /><circle cx="70" cy="72" r="1.4" />
      </g>
    </Svg>
  );
}
