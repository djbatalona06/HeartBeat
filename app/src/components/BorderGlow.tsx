import { useRef, type CSSProperties, type ReactNode } from 'react';
import { useTheme } from '../themes/ThemeProvider';

/**
 * A container whose border lights up with a gradient that tracks the pointer.
 *
 * Ported from the Yawn landing page, re-coloured and stripped of its
 * dependencies — that version leans on framer-motion and Tailwind, and this app
 * has neither. The effect itself is pure CSS: a gradient ring masked to the
 * border with mask-composite, plus a radial spotlight following the pointer.
 *
 * Under calm mode or reduced motion the pointer listener is never attached and
 * a soft static glow is shown instead, so the frame still reads as lit without
 * anything moving.
 */

interface Props {
  children: ReactNode;
  className?: string;
  /** Stops for the ring. Defaults to the current theme's accent. */
  colors?: string[];
  /** 0–1.5, how bright the pointer spotlight gets. */
  intensity?: number;
  /** Softness of the spotlight falloff, in px. */
  radius?: number;
  /** When true the ring also drifts on its own. */
  animated?: boolean;
}

export function BorderGlow({
  children,
  className = '',
  colors,
  intensity = 1,
  radius = 220,
  animated = false,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { calm } = useTheme();

  // Reading the live custom properties rather than importing a palette keeps
  // this correct in all five themes without knowing about any of them.
  const stops = colors ?? [
    'var(--color-accent)',
    'var(--color-border)',
    'var(--color-accent)',
  ];

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--gx', `${e.clientX - r.left}px`);
    el.style.setProperty('--gy', `${e.clientY - r.top}px`);
    el.style.setProperty('--go', String(intensity));
  };

  const style = {
    '--bg-gradient': `linear-gradient(130deg, ${stops.join(', ')})`,
    '--glow-radius': `${radius}px`,
    // Calm still gets a ring, just one that does not chase anything.
    '--go': calm ? String(0.35 * intensity) : '0',
    '--gx': '50%',
    '--gy': '0%',
  } as CSSProperties;

  return (
    <div
      ref={ref}
      style={style}
      className={`border-glow ${animated && !calm ? 'border-glow-animated' : ''} ${className}`}
      onPointerMove={calm ? undefined : onMove}
      onPointerLeave={calm ? undefined : () => ref.current?.style.setProperty('--go', '0')}
    >
      {children}
    </div>
  );
}
