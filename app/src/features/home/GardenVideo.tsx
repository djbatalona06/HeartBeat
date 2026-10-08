import { useEffect, useRef, useState } from 'react';

/** The same phone-held-upright box `34-engine-garden.css` frames the garden for. */
const PHONE_PORTRAIT = '(orientation: portrait) and (max-width: 640px)';

function usePhonePortrait(): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(PHONE_PORTRAIT).matches);
  useEffect(() => {
    const mq = window.matchMedia(PHONE_PORTRAIT);
    const sync = () => setMatch(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return match;
}

/** Data Saver is the user saying "not now" to a 300 KB loop. */
function saveData(): boolean {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return conn?.saveData === true;
}

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
 * ## Why only a phone held upright
 *
 * The clips are 540x960. `object-fit: cover` on a landscape window would blow a
 * 540 px frame up to the full width and crop it to a band, which is blurry and
 * shows none of the tree. Everywhere else the drawn garden is the better picture.
 */
export function GardenVideo({ src }: { src: string }) {
  const phone = usePhonePortrait();
  if (!phone || saveData()) return null;
  // Keyed on the clip so a theme change starts from "not playing yet" rather
  // than showing the new film at the old one's opacity.
  return <Clip key={src} src={src} />;
}

function Clip({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  // A hidden tab should not keep decoding. Browsers usually stop on their own,
  // but "usually" is not a promise a battery can rely on.
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const onVisibility = () => {
      if (document.hidden) video.pause();
      else void video.play().catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
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
