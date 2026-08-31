import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, loadSettings } from '../../db/database';
import { todayKey } from '../../domain/day';
import { levelProgress } from '../../domain/xp';
import { useTheme } from '../../themes/ThemeProvider';
import { getMascot } from '../pet/mascots';
import { HOME_DESTINATIONS, ringLayout } from './layout';

interface RingMetrics {
  width: number;
  height: number;
  /** Diameter of one bubble: `--tap` plus `--space-5`, whatever those are today. */
  bubble: number;
  /** Air between bubbles and around the pet: `--space-5`. */
  gap: number;
}

const UNMEASURED: RingMetrics = { width: 0, height: 0, bubble: 0, gap: 0 };

/**
 * The ring's measurements, in px, all four of them measured rather than typed.
 *
 * The two token sizes are taken off a pair of zero-height probe elements sized
 * by the same custom properties the bubbles use, and the probes are observed
 * alongside the box. That is deliberate and not a flourish: reading the tokens
 * off `document.documentElement` instead would race the theme engine, because
 * `ThemeProvider` writes them in a *parent* effect and React runs a child's
 * effects first — the first read would find nothing and every later one would
 * find the outgoing theme. A probe cannot get that wrong: if a pack overrides
 * `--tap` or `--space-5` the probe resizes, the observer fires, and the ring is
 * laid out again with the numbers actually in force.
 */
function useRingMetrics() {
  const box = useRef<HTMLDivElement>(null);
  const bubbleProbe = useRef<HTMLSpanElement>(null);
  const gapProbe = useRef<HTMLSpanElement>(null);
  const [metrics, setMetrics] = useState<RingMetrics>(UNMEASURED);

  useEffect(() => {
    const el = box.current;
    const forBubble = bubbleProbe.current;
    const forGap = gapProbe.current;
    if (!el || !forBubble || !forGap) return;

    const read = () => {
      const rect = el.getBoundingClientRect();
      const next: RingMetrics = {
        width: rect.width,
        height: rect.height,
        bubble: forBubble.getBoundingClientRect().width,
        gap: forGap.getBoundingClientRect().width,
      };
      // Same numbers, same object: a fresh one per observation would re-render
      // the whole ring for nothing.
      setMetrics((prev) =>
        prev.width === next.width &&
        prev.height === next.height &&
        prev.bubble === next.bubble &&
        prev.gap === next.gap
          ? prev
          : next,
      );
    };

    const observer = new ResizeObserver(read);
    observer.observe(el);
    observer.observe(forBubble);
    observer.observe(forGap);
    read();
    return () => observer.disconnect();
  }, []);

  return { box, bubbleProbe, gapProbe, metrics };
}

export function DashboardPage() {
  const { theme, calm } = useTheme();
  const settings = useLiveQuery(loadSettings, []);
  const day = todayKey(settings?.timeZone ?? 'America/Los_Angeles');
  const memberId = settings?.memberId;

  const mood = useLiveQuery(
    () => (memberId ? db.moods.where('[memberId+day]').equals([memberId, day]).first() : undefined),
    [memberId, day],
  );
  const exercise = useLiveQuery(
    () => (memberId ? db.exercises.where('[memberId+day]').equals([memberId, day]).first() : undefined),
    [memberId, day],
  );
  const pet = useLiveQuery(
    () => (settings?.coupleId ? db.pet.get(settings.coupleId) : undefined),
    [settings?.coupleId],
  );
  // Whether there is a cycle log at all, not what is in it: the bubble is a
  // door, and a door should not read out what is behind it to whoever walks past.
  const hasCycle = useLiveQuery(async () => (await db.cycles.count()) > 0, []);

  // `Pet.level` is carried forward from whoever last wrote the row and is never
  // recomputed, so the level shown is always derived from the XP instead. XP
  // only ever goes up — the pet cannot lose it, so this bar never runs backwards.
  const progress = levelProgress(pet?.xp ?? 0);
  const petMood = pet?.mood ?? 'content';
  const mascot = getMascot(theme.id);

  const { box, bubbleProbe, gapProbe, metrics } = useRingMetrics();
  const ring = ringLayout({
    count: HOME_DESTINATIONS.length,
    box: { width: metrics.width, height: metrics.height },
    bubble: metrics.bubble,
    gap: metrics.gap,
  });
  // A box too small to seat a ring — a landscape phone, a very short window —
  // gets the same six doors stacked in rows instead. Hiding them and leaving
  // them clickable would be the one genuinely broken outcome.
  const measured = metrics.width > 0 && metrics.bubble > 0;
  const shape = measured && ring.fits ? 'ring' : 'rows';

  // Only the doors that have something to say today say it, and only as a dot.
  const loggedToday: Record<string, boolean> = {
    '/mood': Boolean(mood),
    '/exercise': Boolean(exercise),
    '/cycle': Boolean(hasCycle),
  };

  const ringStyle = { '--home-mascot': `${ring.mascot}px` } as CSSProperties;

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">HeartBeat</h1>
        <p className="page-sub">
          {settings?.coupleId ? 'Paired' : 'Not paired yet'} · {day}
        </p>
      </header>

      <div
        className="home-ring"
        ref={box}
        style={ringStyle}
        data-ready={measured ? 'true' : 'false'}
        data-shape={shape}
      >
        {/* Sized by the same custom properties the bubbles are, and watched, so
            the layout is measured in whatever the tokens currently say. */}
        <span className="home-probe home-probe-bubble" ref={bubbleProbe} aria-hidden="true" />
        <span className="home-probe home-probe-gap" ref={gapProbe} aria-hidden="true" />

        <div
          className="home-mascot"
          data-mood={petMood}
          data-calm={calm ? 'true' : 'false'}
          style={shape === 'ring' ? { left: ring.centre.x, top: ring.centre.y } : undefined}
          role="img"
          aria-label={`${mascot.name} the ${mascot.species}, level ${progress.level} and ${petMood}`}
        >
          <mascot.Art mood={petMood} />
        </div>

        {HOME_DESTINATIONS.map((door, index) => {
          const slot = ring.slots[index];
          const logged = loggedToday[door.to] === true;
          return (
            <Link
              key={door.to}
              to={door.to}
              className="home-bubble"
              style={shape === 'ring' && slot ? { left: slot.x, top: slot.y } : undefined}
              data-logged={logged ? 'true' : 'false'}
              aria-label={logged ? `${door.label}, logged today` : door.label}
            >
              <span className="home-bubble-glyph" aria-hidden="true">{door.glyph}</span>
              <span className="home-bubble-label">{door.label}</span>
            </Link>
          );
        })}
      </div>

      <section className="home-pet">
        <div className="home-pet-head">
          <span className="home-pet-name">{mascot.name}</span>
          <span className="home-pet-level">
            Lv {progress.level} · {progress.into}/{progress.needed} XP
          </span>
        </div>
        <div className="home-pet-bar">
          <div className="home-pet-fill" style={{ width: `${progress.fraction * 100}%` }} />
        </div>
        <p className="home-pet-blurb">{mascot.blurb}</p>
      </section>
    </div>
  );
}
