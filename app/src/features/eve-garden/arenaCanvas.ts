import { ARENA_HEIGHT, ARENA_WIDTH } from '../../domain/rpg/arena';
import { arenaPaint, type ArenaCssTokens } from '../pet/mascots/3d/arenaPalette';
import { toRgb } from '../pet/mascots/3d/cssColor';
import type { Tokens } from '../pet/mascots/3d/gardenPalette';

function rgbHex([r, g, b]: readonly number[]): string {
  return `#${[r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;
}

function rgbTokens(colors: ArenaCssTokens): Tokens | null {
  const base = toRgb(colors.base);
  const text = toRgb(colors.text);
  const accent = toRgb(colors.accent);
  const success = toRgb(colors.success);
  const danger = toRgb(colors.danger);
  return base && text && accent && success && danger
    ? { base, text, accent, success, danger }
    : null;
}

/**
 * A static, theme-aware checker floor for calm, Save-Data, or a failed 3D bake.
 * The pixel dimensions still map one-for-one to the game's walkable grid.
 */
export function drawStaticArenaFloor(
  colors: ArenaCssTokens,
  cols = ARENA_WIDTH,
  rows = ARENA_HEIGHT,
  tilePx = 64,
): HTMLCanvasElement | null {
  const tokens = rgbTokens(colors);
  if (!tokens) return null;
  const canvas = document.createElement('canvas');
  canvas.width = cols * tilePx;
  canvas.height = rows * tilePx;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  const paint = arenaPaint(tokens);
  ctx.fillStyle = rgbHex(paint.colors.grout);
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const inset = Math.max(1, Math.round(tilePx / 48));
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = col * tilePx + inset;
      const y = row * tilePx + inset;
      const size = tilePx - inset * 2;
      ctx.fillStyle = rgbHex((col + row) % 2 === 0 ? paint.colors.tileA : paint.colors.tileB);
      ctx.fillRect(x, y, size, size);
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = rgbHex(paint.highlight);
      ctx.fillRect(x, y, size, inset);
      ctx.fillRect(x, y, inset, size);
      ctx.fillStyle = rgbHex(paint.shadow);
      ctx.fillRect(x, y + size - inset, size, inset);
      ctx.fillRect(x + size - inset, y, inset, size);
      ctx.globalAlpha = 1;
    }
  }
  finishArenaCanvas(canvas, colors, cols, rows, tilePx);
  canvas.dataset.arena3d = 'false';
  return canvas;
}

/** Apply a quiet raised rim and repeatable luminance-only grain to a board canvas. */
export function finishArenaCanvas(
  canvas: HTMLCanvasElement,
  colors: ArenaCssTokens,
  cols = ARENA_WIDTH,
  rows = ARENA_HEIGHT,
  tilePx = 64,
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
