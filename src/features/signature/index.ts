import saved from './signature.json'

/**
 * A signature as captured on the signing page (art/sign/): its line width and its strokes,
 * each a list of [x, y, ms] points. Coordinates are the drum drawing's (1536 x 1024), and
 * ms counts from the first point of the whole signature.
 */
export type Signature = {
  width: number
  strokes: [number, number, number][][]
}

export const DRAWING = { width: 1536, height: 1024 }
// Pauses between strokes longer than this are shortened when the signature writes itself.
const MAX_GAP_MS = 220
const MAX_KEYFRAMES = 40

/** Smooth SVG path data through a stroke's points: quadratic curves between midpoints. */
export function strokePath(points: readonly [number, number, number][]): string {
  const [first] = points
  if (!first) return ''
  if (points.length === 1) return `M${first[0]} ${first[1]}l0.01 0`
  let d = `M${first[0]} ${first[1]}`
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i]!
    const [nx, ny] = points[i + 1]!
    d += `Q${x} ${y} ${(x + nx) / 2} ${(y + ny) / 2}`
  }
  const last = points[points.length - 1]!
  return `${d}L${last[0]} ${last[1]}`
}

/**
 * Draws a signature into an <svg> whose viewBox is the drawing, one path per stroke.
 * With `animate`, it writes itself on at the speed it was signed (long pauses shortened).
 */
export function drawSignature(svg: SVGSVGElement, signature: Signature, animate: boolean): void {
  svg.replaceChildren()
  let clock = 0
  let previousEnd: number | undefined
  for (const points of signature.strokes) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', strokePath(points))
    path.setAttribute('fill', 'none')
    path.setAttribute('stroke', 'currentColor')
    path.setAttribute('stroke-width', String(signature.width))
    path.setAttribute('stroke-linecap', 'round')
    path.setAttribute('stroke-linejoin', 'round')
    svg.append(path)
    if (!animate || !points.length) continue

    const start = points[0]![2]
    const end = points[points.length - 1]![2]
    clock += previousEnd === undefined ? 0 : Math.min(start - previousEnd, MAX_GAP_MS)
    previousEnd = end
    const duration = Math.max(end - start, 16)

    // Keyframes follow the pen: how far along the stroke it was at each moment.
    const length = path.getTotalLength()
    const along = [0]
    for (let i = 1; i < points.length; i++) {
      const [x, y] = points[i]!
      const [px, py] = points[i - 1]!
      along.push(along[i - 1]! + Math.hypot(x - px, y - py))
    }
    const total = along[along.length - 1] || 1
    const step = Math.max(1, Math.ceil(points.length / MAX_KEYFRAMES))
    const keyframes: Keyframe[] = []
    for (let i = 0; i < points.length; i += step) {
      keyframes.push({
        strokeDashoffset: length * (1 - along[i]! / total),
        offset: (points[i]![2] - start) / duration,
      })
    }
    keyframes.push({ strokeDashoffset: 0, offset: 1 })

    // The gap is longer than the stroke, so while hidden no dash (or its round cap) touches it.
    path.style.strokeDasharray = `${length} ${length + 1}`
    path.style.strokeDashoffset = `${length}`
    path.animate(keyframes, { duration, delay: clock, fill: 'forwards' })
    clock += duration
  }
}

/**
 * Writes the saved signature (signature.json) onto the kit once the page has loaded, at
 * the speed it was signed; with reduced motion, it's simply there.
 */
export function mountSignature(svg: SVGSVGElement): void {
  // JSON imports type as number[][]; the signing page only ever saves [x, y, ms] points.
  const signature = saved as Signature
  const write = () =>
    drawSignature(svg, signature, !matchMedia('(prefers-reduced-motion: reduce)').matches)
  if (document.readyState === 'complete') write()
  else addEventListener('load', write, { once: true })
}
