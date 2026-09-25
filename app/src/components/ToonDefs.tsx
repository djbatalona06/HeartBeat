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
 * underneath it: nothing here names a palette colour. The light is from the
 * shape's silhouette (`SourceAlpha`) rather than from each part, which is what
 * makes it one object under one light instead of a pile of stickers.
 *
 * A `url()` filter that does not resolve is ignored, so a page without this
 * mounted shows the drawings flat, exactly as they were — never blank.
 */

/** `rig.ts`'s LIGHT: near-white, because nothing in this app paints #fff. */
const LIGHT = '#fdfcfb';

function Toon({ id, shine, exponent, bands }: {
  id: string;
  shine: number;
  exponent: number;
  /** Alpha steps for the highlight: discrete, so it lands as a band. */
  bands: string;
}) {
  return (
    <filter id={id} x="-4%" y="-4%" width="108%" height="108%" colorInterpolationFilters="sRGB">
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
      <feFlood floodColor="#000" floodOpacity="0.16" />
      <feComposite in2="rim" operator="in" result="shade" />
      <feMerge>
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
      </defs>
    </svg>
  );
}
