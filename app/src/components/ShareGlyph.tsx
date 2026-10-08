/**
 * Safari's Share button, drawn, so "tap Share" points at something.
 *
 * The step everybody misses is finding the button: on iPhone it is the square
 * with an arrow at the bottom of Safari, on iPad at the top right. Drawn in
 * `currentColor` so it sits in whatever text it is placed in. An original
 * drawing of the shape, not Apple's asset.
 */
export function ShareGlyph() {
  return (
    <svg className="share-glyph" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M12 3v11M8 7l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 10H6.5A1.5 1.5 0 0 0 5 11.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 17.5 10H16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
