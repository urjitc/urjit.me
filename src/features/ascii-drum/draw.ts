import { clamp, hash } from '../../lib/math'
import { BG, INK } from './constants'
import { chooseGlyph, scrambleGlyph } from './glyphs'
import type { Sim } from './sim'

export function drawSim(
  context: CanvasRenderingContext2D,
  active: Sim,
  now: number,
): void {
  const elapsed = now * 0.001
  const { n, col, row, homeX, homeY, coverage, noise, cymbal, ox, oy, scramble, width, height, font } =
    active

  // Opaque red clear — AA fringes composite against BG, not the page through alpha.
  context.fillStyle = BG
  context.fillRect(0, 0, width, height)
  context.font = font
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillStyle = INK

  for (let i = 0; i < n; i++) {
    const column = col[i]!
    const r = row[i]!
    const cellNoise = noise[i]!
    const offsetX = ox[i]!
    const offsetY = oy[i]!
    const scrambleAmount = scramble[i]!
    const energy = clamp(Math.hypot(offsetX, offsetY) * 0.04 + scrambleAmount, 0, 1)
    const isCymbal = cymbal[i] === 1

    const shimmer = isCymbal
      ? Math.sin(elapsed * 7 + column * 0.8 + r * 0.5) * 0.16
        + Math.sin(elapsed * 12 + column * 0.3 - r * 0.6) * 0.06
      : 0
    const density = clamp(coverage[i]! * 3.8 + shimmer + energy * 0.35, 0, 1)

    let character = chooseGlyph(density, cellNoise)
    if (scrambleAmount > 0.08) {
      const wild = scrambleGlyph(column, r, now, scrambleAmount, cellNoise)
      if (scrambleAmount > 0.45 || hash(column + 3, r + 7) < scrambleAmount) character = wild
    }
    if (character === ' ') continue

    const x = homeX[i]! + offsetX + (isCymbal ? Math.sin(elapsed * 10 + r * 0.7) * 0.45 : 0)
    const y = homeY[i]! + offsetY + (isCymbal ? Math.cos(elapsed * 8 + column * 0.5) * 0.35 : 0)
    context.fillText(character, x, y)
  }
}
