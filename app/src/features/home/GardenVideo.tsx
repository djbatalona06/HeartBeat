import { useEffect, useRef, useState } from 'react';

/** Data Saver is the user saying "not now" to a 300 KB loop. */
function saveData(): boolean {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return conn?.saveData === true;
}

/** How long to wait for `playing` before assuming autoplay was refused. */
const AUTOPLAY_GRACE_MS = 1500;

/**
 * A looping film of the theme's tree, laid over the drawn garden.
 *
 * ## Why it sits over the SVG instead of replacing it
 *
 * The drawn garden stays mounted underneath, which makes it the first paint,
 * the offline view and the fallback when a browser will not play the clip. The
 * film is invisible until it is actually playing, then fades in — so there is
 * never a black frame, and a failed download is just the garden you already had.
 *
 * ## Why it asks to play instead of trusting `autoplay`
 *
 * "Invisible until playing" means a browser that quietly refuses to start the
 * clip looks exactly like a clip that was never added. Two things did that:
 *
 * - React writes `muted` as a *property* after the element exists, not as an
 *   attribute, and Safari decides whether autoplay is allowed from the
 *   attribute at creation. So `muted` is set again here, by hand, before
 *   `play()` is called.
 * - iOS Low Power Mode and data-saver modes refuse autoplay outright, whatever
 *   the markup says. The first touch anywhere is a user gesture, so one
 *   listener waits for it and tries again.
 *
 * It plays at every window size. `object-fit: cover` crops a tall clip on a wide
 * window, but the drawn garden behind it is also cropped there, and a blurred
 * tree is better than the reported absence of one.
 */
export function GardenVideo({ src }: { src: string }) {
  if (saveData()) return null;
  // Keyed on the clip so a theme change starts from "not playing yet" rather
  // than showing the new film at the old one's opacity.
  return <Clip key={src} src={src} />;
}

function Clip({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    const start = () => {
      video.muted = true;
      void video.play().catch(() => {});
    };
    start();

    // A hidden tab should not keep decoding. Browsers usually stop on their
    // own, but "usually" is not a promise a battery can rely on.
    const onVisibility = () => {
      if (document.hidden) video.pause();
      else start();
    };
    document.addEventListener('visibilitychange', onVisibility);

    // If autoplay was refused, the next touch or click is allowed to start it.
    const onGesture = () => {
      if (video.paused) start();
    };
    const timer = window.setTimeout(() => {
      if (!video.paused) return;
      document.addEventListener('pointerdown', onGesture, { once: true });
      document.addEventListener('keydown', onGesture, { once: true });
    }, AUTOPLAY_GRACE_MS);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('pointerdown', onGesture);
      document.removeEventListener('keydown', onGesture);
    };
  }, []);

  return (
    <video
      ref={ref}
      className="home-scene-video"
      data-playing={playing ? 'true' : 'false'}
      aria-hidden="true"
      tabIndex={-1}
      autoPlay
      loop
      muted
      playsInline
      disablePictureInPicture
      preload="auto"
      src={src}
      onPlaying={() => setPlaying(true)}
    />
  );
}
