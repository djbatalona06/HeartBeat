let probe: CanvasRenderingContext2D | null = null;
const resolved = new Map<string, [number, number, number]>();

/**
 * Any CSS colour as sRGB, 0–1 a channel, by painting one pixel with it.
 *
 * A custom property's computed value is its text, not a colour: a dye is a
 * hex, but `--color-accent-live` is a `color-mix()`, and a future palette may
 * be anything the browser can paint. Painting it is the one parser that
 * agrees with the stylesheet on every one of them.
 *
 * Shared by the pets (`engine.ts`) and the home garden (`gardenScene.ts`), so
 * the two read the theme the same way.
 */
export function toRgb(css: string): [number, number, number] | null {
  const cached = resolved.get(css);
  if (cached) return cached;
  probe ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!probe) return null;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = 'transparent'; // so a colour the browser rejects cannot inherit the last one
  probe.fillStyle = css;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  const rgb: [number, number, number] = [r / 255, g / 255, b / 255];
  resolved.set(css, rgb);
  return rgb;
}
