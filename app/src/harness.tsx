/**
 * The overworld, with no gates.
 *
 * A dev-only entry, built by `npm run overworld:harness` and never referenced
 * by `vite.config.ts` — nothing in `dist/` imports it, so it cannot reach a
 * user or the service-worker manifest. It exists because the real route sits
 * behind `FirstRunGate` and `PairGate`, both of which want a second paired
 * phone to get past honestly, which makes "look at the garden" a half-hour of
 * clicking rather than a command. This mounts `ZONES[0]` directly against
 * whichever theme is applied to `<html>`, with a switcher for exactly that —
 * checking a redraw against every real pack was what caught the inverted
 * sprite palette in the first place, and it should stay one command away.
 */
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { THEMES, applyTheme } from './themes';
import { ZONES } from './domain/rpg/zones';
import type { OverworldHandle } from './features/rpg/overworld/game';
import type { ThemeMode } from './themes/types';
import './styles.css';

function Harness() {
  const host = useRef<HTMLDivElement | null>(null);
  const handle = useRef<OverworldHandle | null>(null);
  const [met, setMet] = useState<string | null>(null);
  const [themeId, setThemeId] = useState(THEMES[0].id);
  const [mode, setMode] = useState<ThemeMode>('dark');

  useEffect(() => {
    const theme = THEMES.find((t) => t.id === themeId) ?? THEMES[0];
    applyTheme(theme, false, mode);
  }, [themeId, mode]);

  useEffect(() => {
    let live = true;
    import('./features/rpg/overworld/game').then(({ startOverworld }) => {
      if (!live || !host.current) return;
      handle.current = startOverworld(host.current, ZONES[0], { onEncounter: setMet });
    });
    return () => { live = false; handle.current?.destroy(); handle.current = null; };
    // Re-mounts on a theme change: the palette is baked once at scene boot
    // (see bake.ts), so seeing a switched theme means starting a fresh scene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeId, mode]);

  return (
    <div style={{ fontFamily: 'sans-serif', padding: 12 }}>
      <p>
        {THEMES.map((t) => (
          <button key={t.id} type="button" onClick={() => setThemeId(t.id)}
            style={{ fontWeight: t.id === themeId ? 'bold' : 'normal' }}>
            {t.id}
          </button>
        ))}
        {' | '}
        <button type="button" onClick={() => setMode('dark')}
          style={{ fontWeight: mode === 'dark' ? 'bold' : 'normal' }}>dark</button>
        <button type="button" onClick={() => setMode('light')}
          style={{ fontWeight: mode === 'light' ? 'bold' : 'normal' }}>light</button>
      </p>
      <p id="met">met: {met ?? 'nothing yet'}</p>
      <div className="overworld-stage" ref={host} />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
