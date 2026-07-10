import { clamp } from '../../lib/math'
import { GLYPH_BANDS, SCRAMBLE_POOL } from './constants'

export function chooseGlyph(density: number, noise: number): string {
  const band = GLYPH_BANDS[Math.round(clamp(density, 0, 1) * (GLYPH_BANDS.length - 1))] ?? ' '
  return band[Math.min(band.length - 1, Math.floor(noise * band.length))] ?? ' '
}

export function scrambleGlyph(
  column: number,
  row: number,
  now: number,
  amount: number,
  noise: number,
): string {
  const tick = Math.floor(now / (28 + noise * 40))
  const value = Math.sin(column * 19.13 + row * 47.91 + tick * 12.7 + amount * 91.3) * 43758.5453
  return SCRAMBLE_POOL[Math.floor((value - Math.floor(value)) * SCRAMBLE_POOL.length)] ?? '#'
}

export function hitCymbal(
  x: number,
  y: number,
  cymbals: readonly { x: number; y: number; rx: number; ry: number }[],
): boolean {
  for (const c of cymbals) {
    const dx = (x - c.x) / c.rx
    const dy = (y - c.y) / c.ry
    if (dx * dx + dy * dy <= 1) return true
  }
  return false
}
