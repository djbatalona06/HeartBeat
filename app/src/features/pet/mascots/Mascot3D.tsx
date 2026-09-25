import { useEffect, useRef, useState, type ComponentType } from 'react';
import type { MascotHandle } from './3d/engine';
import type { MascotMood } from './roster';

interface Props {
  mood: MascotMood;
}

/**
 * A mascot in 3D, standing on its own SVG drawing.
 *
 * The drawing renders first and stays in the page underneath; the canvas fades
 * in over it once the engine has painted a real frame. Three things lean on
 * that ordering:
 *
 * - three.js is a lazy chunk kept out of the precache (see `vite.config.ts`),
 *   so the home screen paints its pet without waiting for it;
 * - offline before the chunk was ever fetched, or on a phone with no WebGL,
 *   the drawing simply stays — no blank box on Home, onboarding or the 404;
 * - it has the same box as always (`.home-mascot-art`, 100% × 100%), so the
 *   nine places that size a mascot need not know which one they got.
 *
 * `aria-hidden` on both, as the SVGs always were: every caller that needs the
 * pet named names it on its own wrapper.
 */
export function withDepth(themeId: string, Flat: ComponentType<Props>): ComponentType<Props> {
  function Mascot3D({ mood }: Props) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const handle = useRef<MascotHandle | null>(null);
    const moodNow = useRef(mood);
    moodNow.current = mood;
    const [ready, setReady] = useState(false);

    useEffect(() => {
      let gone = false;
      import('./3d/engine')
        .then(({ mount }) => {
          if (gone || !canvas.current) return;
          handle.current = mount(canvas.current, themeId, moodNow.current, (ok) => {
            if (!gone) setReady(ok);
          });
        })
        // Offline with the chunk never cached: the drawing is the pet.
        .catch(() => undefined);
      return () => {
        gone = true;
        handle.current?.dispose();
        handle.current = null;
      };
    }, []);

    useEffect(() => {
      handle.current?.setMood(mood);
    }, [mood]);

    return (
      <span className="mascot-3d" data-ready={ready || undefined}>
        <Flat mood={mood} />
        <canvas ref={canvas} className="mascot-3d-canvas" aria-hidden="true" />
      </span>
    );
  }
  Mascot3D.displayName = `Mascot3D(${themeId})`;
  return Mascot3D;
}
