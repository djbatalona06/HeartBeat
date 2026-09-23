import { useEffect, useRef } from 'react';
import { SPRITE_SIZE, spriteFor } from '../../../domain/rpg/sprites';
import { drawSprite, readPalette } from '../../rpg/overworld/bake';

/**
 * One sprite from `sprites.ts`, drawn on a canvas in the theme's own colours.
 *
 * The same `drawSprite` the garden's scene bakes with, so the boss standing in
 * the gate is pixel for pixel the one waiting behind it — without starting
 * Phaser for a screen that exists to put that off. The palette is read off
 * the canvas's own computed style, so a theme or a dark face repaints it on
 * the next render.
 */
export function PixelSprite({ spriteKey, label, className, dark }: {
  spriteKey: string;
  label: string;
  className?: string;
  /** Only here to repaint when the face flips. */
  dark?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const target = canvas.current;
    const sprite = spriteFor(spriteKey);
    const ctx = target?.getContext('2d');
    if (!target || !sprite || !ctx) return;
    ctx.clearRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
    ctx.drawImage(drawSprite(sprite, readPalette(target)), 0, 0);
  }, [spriteKey, dark]);

  return (
    <canvas
      ref={canvas}
      className={className}
      width={SPRITE_SIZE}
      height={SPRITE_SIZE}
      role="img"
      aria-label={label}
    />
  );
}
