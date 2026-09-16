import type { MascotMood } from './roster';

/**
 * The bits of a face that all five mascots share.
 *
 * Three moods, three faces, and none of them is a frown. There was a fourth;
 * nothing ever set it, and `mood.test.ts` now fails if it comes back.
 *
 * Drawn rather than imported: no third-party artwork anywhere, see NOTICE.md.
 */

interface EyesProps {
  /** Midpoint between the two eyes. */
  cx: number;
  cy: number;
  /** Distance from that midpoint out to each eye. */
  spread: number;
  r: number;
  mood: MascotMood;
  color?: string;
}

function eye(x: number, y: number, r: number, mood: MascotMood, color: string) {
  if (mood === 'happy') {
    // An upward arc. A smiling eye carries a mascot further than a smiling mouth.
    return (
      <path
        key={x}
        d={`M${x - r} ${y + r * 0.35} q ${r} ${-r * 1.4} ${2 * r} 0`}
        fill="none"
        stroke={color}
        strokeWidth={r * 0.62}
        strokeLinecap="round"
      />
    );
  }
  if (mood === 'sleepy') {
    return (
      <path
        key={x}
        d={`M${x - r} ${y - r * 0.2} q ${r} ${r * 1.2} ${2 * r} 0`}
        fill="none"
        stroke={color}
        strokeWidth={r * 0.62}
        strokeLinecap="round"
      />
    );
  }
  return <ellipse key={x} cx={x} cy={y} rx={r * 0.68} ry={r * 0.9} fill={color} />;
}

export function Eyes({ cx, cy, spread, r, mood, color = 'var(--color-base)' }: EyesProps) {
  return (
    <g>
      {eye(cx - spread, cy, r, mood, color)}
      {eye(cx + spread, cy, r, mood, color)}
    </g>
  );
}

interface MouthProps {
  cx: number;
  cy: number;
  /** Full width of the widest mouth this face wants. */
  w: number;
  mood: MascotMood;
  color?: string;
}

export function Mouth({ cx, cy, w, mood, color = 'var(--color-base)' }: MouthProps) {
  const stroke = w * 0.16;
  if (mood === 'sleepy') {
    return <ellipse cx={cx} cy={cy} rx={w * 0.16} ry={w * 0.2} fill={color} />;
  }
  const half = mood === 'happy' ? w / 2 : w * 0.3;
  // Always positive, which dips the curve down into a smile. It used to be able
  // to go negative and lift into a frown; there is no mood left that asks for
  // one, and that is deliberate — see domain/pet/mood.ts.
  const dip = half * (mood === 'happy' ? 1.1 : 0.8);
  return (
    <path
      d={`M${cx - half} ${cy} q ${half} ${dip} ${2 * half} 0`}
      fill="none"
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
    />
  );
}

interface BlushProps {
  cx: number;
  cy: number;
  spread: number;
  r: number;
  color?: string;
}

/** Two soft cheeks. Off when the mood has nothing to blush about. */
export function Blush({ cx, cy, spread, r, color = 'var(--color-danger)' }: BlushProps) {
  return (
    <g opacity="0.32" fill={color}>
      <ellipse cx={cx - spread} cy={cy} rx={r} ry={r * 0.66} />
      <ellipse cx={cx + spread} cy={cy} rx={r} ry={r * 0.66} />
    </g>
  );
}
