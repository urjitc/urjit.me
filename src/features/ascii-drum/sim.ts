import { measureNaturalWidth, prepareWithSegments } from '@chenglou/pretext'
import { getCanvasContext } from '../../lib/dom'
import { clamp, hash } from '../../lib/math'
import { COVERAGE_MIN, CYMBALS, FONT, OVERSAMPLE } from './constants'
import { hitCymbal } from './glyphs'

export type Sim = {
  n: number
  columns: number
  rows: number
  font: string
  width: number
  height: number
  col: Uint16Array
  row: Uint16Array
  homeX: Float32Array
  homeY: Float32Array
  coverage: Float32Array
  noise: Float32Array
  cymbal: Uint8Array
  ox: Float32Array
  oy: Float32Array
  vx: Float32Array
  vy: Float32Array
  scramble: Float32Array
}

const sampleCanvas = document.createElement('canvas')
const sampleContext = getCanvasContext(sampleCanvas, true)

function measureCell(font: string): number {
  return measureNaturalWidth(prepareWithSegments('M', font))
}

function sampleCoverage(
  source: HTMLImageElement,
  columns: number,
  rows: number,
  cellWidth: number,
  lineHeight: number,
  width: number,
  height: number,
): Float32Array {
  sampleCanvas.width = Math.round(width * OVERSAMPLE)
  sampleCanvas.height = Math.round(height * OVERSAMPLE)
  sampleContext.clearRect(0, 0, sampleCanvas.width, sampleCanvas.height)
  sampleContext.imageSmoothingEnabled = true
  sampleContext.imageSmoothingQuality = 'high'

  const sourceRatio = source.naturalWidth / source.naturalHeight
  const sampleRatio = sampleCanvas.width / sampleCanvas.height
  const drawWidth = sourceRatio >= sampleRatio ? sampleCanvas.width : sampleCanvas.height * sourceRatio
  const drawHeight = sourceRatio >= sampleRatio ? sampleCanvas.width / sourceRatio : sampleCanvas.height
  sampleContext.drawImage(
    source,
    (sampleCanvas.width - drawWidth) / 2,
    (sampleCanvas.height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  )

  const pixels = sampleContext.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height).data
  const coverage = new Float32Array(columns * rows)
  const sampleWidth = sampleCanvas.width
  const denom = 255 * OVERSAMPLE * OVERSAMPLE

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      let alpha = 0
      for (let sy = 0; sy < OVERSAMPLE; sy++) {
        for (let sx = 0; sx < OVERSAMPLE; sx++) {
          const px = Math.floor((column + (sx + 0.5) / OVERSAMPLE) * cellWidth * OVERSAMPLE)
          const py = Math.floor((row + (sy + 0.5) / OVERSAMPLE) * lineHeight * OVERSAMPLE)
          alpha += pixels[(py * sampleWidth + px) * 4 + 3] ?? 0
        }
      }
      coverage[row * columns + column] = alpha / denom
    }
  }

  return coverage
}

export function buildSim(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  source: HTMLImageElement,
): Sim {
  const bounds = canvas.getBoundingClientRect()
  const width = Math.max(280, Math.floor(bounds.width))
  const availableHeight = Math.max(216, Math.floor(bounds.height))
  const fontSize = clamp(width / 168, 4.5, 8)
  const font = `400 ${fontSize}px "${FONT}"`
  const cellWidth = measureCell(font)
  const lineHeight = fontSize * 1.12
  const columns = Math.max(96, Math.floor(width / cellWidth))
  const rows = Math.max(78, Math.round(availableHeight / lineHeight))
  const height = rows * lineHeight
  const dpr = Math.min(devicePixelRatio || 1, 2)

  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  context.setTransform(dpr, 0, 0, dpr, 0, 0)

  const gridCoverage = sampleCoverage(source, columns, rows, cellWidth, lineHeight, width, height)
  const live: number[] = []
  for (let i = 0; i < gridCoverage.length; i++) {
    if ((gridCoverage[i] ?? 0) >= COVERAGE_MIN) live.push(i)
  }

  const n = live.length
  const col = new Uint16Array(n)
  const row = new Uint16Array(n)
  const homeX = new Float32Array(n)
  const homeY = new Float32Array(n)
  const coverage = new Float32Array(n)
  const noise = new Float32Array(n)
  const cymbal = new Uint8Array(n)

  for (let i = 0; i < n; i++) {
    const index = live[i]!
    const c = index % columns
    const r = (index - c) / columns
    const x = (c + 0.5) * cellWidth
    const y = (r + 0.5) * lineHeight
    col[i] = c
    row[i] = r
    homeX[i] = x
    homeY[i] = y
    coverage[i] = gridCoverage[index]!
    noise[i] = hash(c, r)
    cymbal[i] = hitCymbal(x / width, y / height, CYMBALS) ? 1 : 0
  }

  return {
    n,
    columns,
    rows,
    font,
    width,
    height,
    col,
    row,
    homeX,
    homeY,
    coverage,
    noise,
    cymbal,
    ox: new Float32Array(n),
    oy: new Float32Array(n),
    vx: new Float32Array(n),
    vy: new Float32Array(n),
    scramble: new Float32Array(n),
  }
}
