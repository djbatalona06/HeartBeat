import { toRgb } from './cssColor';
import { arenaPaint, type ArenaCssTokens } from './arenaPalette';
import type { Tokens } from './gardenPalette';

/**
 * The board's surface finish, shared by the baked 3D floor and the static 2D
 * fallback. It lives under `mascots/3d/` on purpose: anything this file imports
 * must stay inside `3d/` (plus `three`), or the lazy `mascot3d` chunk drags its
 * dependencies into the entry chunk. See CLAUDE.md, "The mascots are 3D".
 */

export function rgbHex([r, g, b]: readonly number[]): string {
  return `#${[r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;
}

export function rgbTokens(colors: ArenaCssTokens): Tokens | null {
  const base = toRgb(colors.base);
  const text = toRgb(colors.text);
  const accent = toRgb(colors.accent);
  const success = toRgb(colors.success);
  const danger = toRgb(colors.danger);
  return base && text && accent && success && danger
    ? { base, text, accent, success, danger }
    : null;
}

/** Apply a quiet raised rim and repeatable luminance-only grain to a board canvas. */
export function finishArenaCanvas(
  canvas: HTMLCanvasElement,
  colors: ArenaCssTokens,
  cols: number,
  rows: number,
  tilePx: number,
): HTMLCanvasElement {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const tokens = rgbTokens(colors);
  if (!ctx || !tokens) return canvas;
  const paint = arenaPaint(tokens);
  const rim = Math.max(1, Math.round(tilePx / 32));
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = rgbHex(paint.highlight);
  ctx.fillRect(0, 0, canvas.width, rim);
  ctx.fillRect(0, 0, rim, canvas.height);
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = rgbHex(paint.shadow);
  ctx.fillRect(0, canvas.height - rim, canvas.width, rim);
  ctx.fillRect(canvas.width - rim, 0, rim, canvas.height);
  ctx.restore();

  try {
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = image.data;
    let seed = 0x51f15e;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const grain = ((seed >>> 28) - 8) * 0.45;
      data[i] = Math.max(0, Math.min(255, data[i] + grain));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + grain));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + grain));
    }
    ctx.putImageData(image, 0, 0);
  } catch {
    // Some constrained browsers disable pixel reads; the ungrained board remains usable.
  }
  canvas.dataset.arenaCols = String(cols);
  canvas.dataset.arenaRows = String(rows);
  return canvas;
}
