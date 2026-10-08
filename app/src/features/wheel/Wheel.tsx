import { useEffect, useState, type CSSProperties } from 'react';
import type { WheelSpin } from '../../db/repository';
import { purseById } from '../../domain/rpg/coinSources';
import { WHEEL_SEGMENTS, restAngle, wheelOdds } from '../../domain/rpg/wheel';
import { useBuzz } from '../../pwa/haptics';
import { useTheme } from '../../themes/ThemeProvider';
import { PrimaryAction } from '../../ui/PrimaryAction';

/**
 * The reward wheel: five equal wedges, each printing its prize and its chance,
 * and a button that waits for you.
 *
 * The result is decided the moment the button is pressed (`onSpin` rolls and
 * pays in one transaction, see `spinWheel`); the spin is only the picture of it.
 * That is why calm and reduced motion are simply "no picture": the wheel jumps
 * to the answer and says it. The wedges are equal in size on purpose -- a 1%
 * wedge drawn to scale is a hairline nobody can read -- so the chance is
 * *printed*, from `wheelOdds`, and also listed below in words for a screen
 * reader and for anyone who would rather read than guess.
 */

const C = 100;
const R = 96;
const SPIN_MS = 3400;
const TURNS = 5;

/** A point on the wheel, `deg` clockwise from straight up. */
const at = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: C + r * Math.sin(a), y: C - r * Math.cos(a) };
};

function wedgePath(index: number, count: number): string {
  const from = at((index / count) * 360, R);
  const to = at(((index + 1) / count) * 360, R);
  return `M${C} ${C} L${from.x} ${from.y} A${R} ${R} 0 0 1 ${to.x} ${to.y} Z`;
}

export interface WheelProps {
  /** Rolls and pays. Null when this spin has already been taken. */
  onSpin: () => Promise<WheelSpin | null>;
  /** The spin was taken before the wheel opened: show it, do not offer it. */
  spent?: boolean;
}

type Phase = 'ready' | 'spinning' | 'landed' | 'gone';

export function Wheel({ onSpin, spent = false }: WheelProps) {
  const { calm } = useTheme();
  const buzz = useBuzz();
  const [phase, setPhase] = useState<Phase>('ready');
  const [deg, setDeg] = useState(0);
  const [won, setWon] = useState<WheelSpin | null>(null);
  const odds = wheelOdds();

  // The picture ends on a timer rather than `transitionend`: a hidden tab never
  // fires it, and the answer was already paid for either way.
  useEffect(() => {
    if (phase !== 'spinning') return undefined;
    const timer = window.setTimeout(() => {
      setPhase('landed');
      buzz('success');
    }, SPIN_MS + 100);
    return () => window.clearTimeout(timer);
  }, [phase, buzz]);

  const press = async () => {
    if (phase !== 'ready' || spent) return;
    // Before any await: iOS only ticks inside the tap itself.
    buzz('tap');
    setPhase('spinning');
    const got = await onSpin();
    if (!got) { setPhase('gone'); return; }
    const index = WHEEL_SEGMENTS.findIndex((s) => s.id === got.segment.id);
    setWon(got);
    setDeg(TURNS * 360 - restAngle(index));
    if (calm) setPhase('landed');
  };

  const prize = won ? purseById(won.purse) : undefined;
  const disc: CSSProperties = {
    transform: `rotate(${deg}deg)`,
    transition: calm || phase === 'ready' ? 'none' : `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.7, 0.1, 1)`,
  };

  return (
    <div className="wheel">
      <div className="wheel-stage" data-no-pull>
        <span className="wheel-pointer" aria-hidden="true" />
        <svg className="wheel-disc" viewBox="0 0 200 200" style={disc} aria-hidden="true">
          {odds.map((o, i) => {
            const mid = ((i + 0.5) / odds.length) * 360;
            return (
              <g key={o.segment.id}>
                <path
                  className="wheel-wedge"
                  data-alt={i % 2 === 1 || undefined}
                  data-rare={o.percent <= 7 || undefined}
                  d={wedgePath(i, odds.length)}
                />
                <g transform={`rotate(${mid} ${C} ${C})`}>
                  <text className="wheel-coins" x={C} y={C - 66} textAnchor="middle">{o.coins}</text>
                  <text className="wheel-chance" x={C} y={C - 50} textAnchor="middle">{o.percent}%</text>
                </g>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="wheel-result" role="status">
        {phase === 'landed' && prize && won ? `You won the ${prize.name.toLowerCase()}: +${won.coins} coins.` : null}
        {phase === 'gone' ? 'That spin has already been taken.' : null}
        {spent && phase === 'ready' ? 'You have spun already. Come back for the next one.' : null}
      </div>

      <PrimaryAction disabled={phase !== 'ready' || spent} onClick={() => void press()}>
        {phase === 'spinning' ? 'Spinning…' : phase === 'landed' ? 'Done' : 'Spin'}
      </PrimaryAction>

      <ul className="wheel-odds" aria-label="What each wedge pays, and the chance">
        {odds.map((o) => (
          <li key={o.segment.id}>
            <span>{purseById(o.segment.purse)?.name}</span>
            <span>{o.coins} coins</span>
            <span>{o.percent}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
