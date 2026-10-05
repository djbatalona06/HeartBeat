/**
 * The toon light for every flat drawing that is not a mascot.
 *
 * The mascots are lit by a shader (features/pet/mascots/3d/rig.ts): a key light
 * above and to the left, a hard-edged band between lit and shadowed, and a
 * near-white highlight. The ~60 party drawings, the chests and the birbhouse
 * are SVG, shown many at once, and giving each a WebGL context would be the
 * cost the mascots' single shared renderer exists to avoid. So they get the
 * same light as an SVG filter, defined once here and applied by class in
 * styles.css — no drawing knows it is lit.
 *
 * It works on the rendered pixels, so it repaints with the theme like the art
 * underneath it: the highlight is `rig.ts`'s near-white and the shade is
 * `--shadow-color`; nothing here names a palette colour. The light is from the
 * shape's silhouette (`SourceAlpha`) rather than from each part, which is what
 * makes it one object under one light instead of a pile of stickers.
 *
 * A `url()` filter that does not resolve is ignored, so a page without this
 * mounted shows the drawings flat, exactly as they were — never blank.
 */

/** `rig.ts`'s LIGHT: near-white, because nothing in this app paints #fff. */
const LIGHT = '#fdfcfb';

function Toon({ id, shine, exponent, bands, cast = false }: {
  id: string;
  shine: number;
  exponent: number;
  /** Alpha steps for the highlight: discrete, so it lands as a band. */
  bands: string;
  /**
   * A soft shadow thrown down and to the right, away from the key light, so
   * the thing sits on the ground instead of floating on the card. Gear and
   * companions only: a whole room casting a shadow on its own card reads as a
   * sticker.
   */
  cast?: boolean;
}) {
  return (
    <filter
      id={id}
      x={cast ? '-8%' : '-4%'}
      y={cast ? '-8%' : '-4%'}
      width={cast ? '122%' : '108%'}
      height={cast ? '126%' : '108%'}
      colorInterpolationFilters="sRGB"
    >
      {/* The shape as a soft height map: its edges fall away, its middle is a dome. */}
      <feGaussianBlur in="SourceAlpha" stdDeviation="2.4" result="dome" />
      {/* Azimuth 225° is up and to the left in SVG's y-down space. */}
      <feSpecularLighting
        in="dome" surfaceScale="4" specularConstant={shine} specularExponent={exponent}
        lightingColor={LIGHT} result="spec"
      >
        <feDistantLight azimuth={225} elevation={48} />
      </feSpecularLighting>
      <feComponentTransfer in="spec" result="band">
        <feFuncA type="discrete" tableValues={bands} />
      </feComponentTransfer>
      <feComposite in="band" in2="SourceAlpha" operator="in" result="lit" />
      {/* The shadow side: the part of the shape that the same shape, nudged
          toward the light, does not cover — a crescent on the lower right. */}
      <feOffset in="SourceAlpha" dx="-2.5" dy="-2.5" result="nudged" />
      <feComposite in="SourceAlpha" in2="nudged" operator="out" result="rim" />
      {/* The theme's own shadow colour, already mode-corrected (themes/tokens.ts).
          A style rather than an attribute: presentation attributes take no var(). */}
      <feFlood style={{ floodColor: 'var(--shadow-color)', floodOpacity: 0.7 }} />
      <feComposite in2="rim" operator="in" result="shade" />
      {cast && (
        <>
          <feOffset in="SourceAlpha" dx="3" dy="6" result="dropped" />
          <feGaussianBlur in="dropped" stdDeviation="2" result="soft" />
          {/* Not `--shadow-color`: in light mode that token is 10% alpha
              already and the cast vanished. The ink `LIGHT_SHADOW_COLOR` is
              made of, at a fixed strength, reads on every card. */}
          <feFlood floodColor="rgb(24, 20, 34)" floodOpacity={0.3} />
          <feComposite in2="soft" operator="in" result="cast" />
        </>
      )}
      <feMerge>
        {cast && <feMergeNode in="cast" />}
        <feMergeNode in="SourceGraphic" />
        <feMergeNode in="shade" />
        <feMergeNode in="lit" />
      </feMerge>
    </filter>
  );
}

/** Mounted once at the app root. Zero-size, and out of the accessibility tree. */
export function ToonDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: 'absolute' }}>
      <defs>
        <Toon id="hb-toon" shine={0.9} exponent={16} bands="0 0 0.28 0.42" />
        {/* Legendary, mythic and the gilded chest: a tighter, brighter catch. */}
        <Toon id="hb-toon-gloss" shine={1.3} exponent={28} bands="0 0.2 0.45 0.62" />
        {/* The same two lights with a cast shadow, for gear and companions. */}
        <Toon id="hb-toon-cast" shine={1} exponent={16} bands="0 0.1 0.3 0.46" cast />
        <Toon id="hb-toon-gloss-cast" shine={1.3} exponent={28} bands="0 0.2 0.45 0.62" cast />
      </defs>
    </svg>
  );
}
