import { getCanvasContext, loadImage } from '../../lib/dom'
import { clamp } from '../../lib/math'
import { CLICK_TARGETS, CYMBALS, FONT } from './constants'
import { drawSim } from './draw'
import { hitRegion } from './glyphs'
import { stepPhysics, type Pointer, type Wave } from './physics'
import { buildSim, type Sim } from './sim'
import './ascii-drum.css'

export type AsciiDrumHandle = {
  destroy: () => void
}

type MountOptions = {
  canvas: HTMLCanvasElement
  sourceUrl?: string
}

export async function mountAsciiDrum({
  canvas,
  sourceUrl,
}: MountOptions): Promise<AsciiDrumHandle> {
  const compactView = matchMedia('(max-width: 640px)')
  const defaultLabel = canvas.getAttribute('aria-label')
  let useSnare = sourceUrl === undefined && compactView.matches
  const defaultSourceUrl = () => useSnare
    ? new URL('./snare.svg', import.meta.url).href
    : new URL('./drum-kit.svg', import.meta.url).href
  const setLabel = () => canvas.setAttribute(
    'aria-label',
    useSnare
      ? 'Interactive ASCII snare drum. Move to push glyphs; tap to pulse.'
      : defaultLabel ?? 'Interactive ASCII drum kit. Move to push glyphs; click to pulse.',
  )
  setLabel()
  const context = getCanvasContext(canvas, false)
  let sim: Sim | null = null
  let lastFrame = 0
  let frameId = 0
  let settled = true
  let resizeQueued = false
  let fadedIn = false
  let visible = document.visibilityState !== 'hidden'
  let waves: Wave[] = []
  const pointer: Pointer = { x: 0, y: 0, px: 0, py: 0, active: false }

  let [source] = await Promise.all([
    loadImage(sourceUrl ?? defaultSourceUrl()),
    document.fonts.load(`400 12px "${FONT}"`),
  ])

  function startLoop(): void {
    if (frameId !== 0 || !visible || sim === null) return
    lastFrame = performance.now()
    frameId = requestAnimationFrame(tick)
  }

  function stopLoop(): void {
    if (frameId === 0) return
    cancelAnimationFrame(frameId)
    frameId = 0
  }

  function rebuild(): void {
    if (source.naturalWidth === 0) return
    sim = buildSim(canvas, context, source, useSnare ? [] : CYMBALS)
    settled = true
    waves = []
    drawSim(context, sim, performance.now())
    startLoop()
    if (!fadedIn) {
      fadedIn = true
      canvas.classList.add('is-ready')
    }
  }

  function queueRebuild(): void {
    if (resizeQueued) return
    resizeQueued = true
    requestAnimationFrame(() => {
      resizeQueued = false
      rebuild()
    })
  }

  function pointerPosition(event: PointerEvent): { x: number; y: number } {
    const bounds = canvas.getBoundingClientRect()
    const scaleX = (sim?.width ?? canvas.clientWidth) / bounds.width
    const scaleY = (sim?.height ?? canvas.clientHeight) / bounds.height
    return {
      x: (event.clientX - bounds.left) * scaleX,
      y: (event.clientY - bounds.top) * scaleY,
    }
  }

  function onPointerMove(event: PointerEvent): void {
    const position = pointerPosition(event)
    if (!pointer.active) {
      pointer.px = position.x
      pointer.py = position.y
    }
    pointer.x = position.x
    pointer.y = position.y
    pointer.active = true
    settled = false
    // crosshair only over the clickable heads and cymbals, default elsewhere
    if (sim !== null) {
      canvas.style.cursor = useSnare
        || hitRegion(position.x / sim.width, position.y / sim.height, CLICK_TARGETS)
        ? 'crosshair'
        : 'default'
    }
  }

  function onPointerLeave(): void {
    pointer.active = false
  }

  function onPointerDown(event: PointerEvent): void {
    if (sim === null) return
    const { x, y } = pointerPosition(event)
    // only the drum heads and cymbals fire the click pulse
    if (!useSnare && !hitRegion(x / sim.width, y / sim.height, CLICK_TARGETS)) return
    waves.push({ x, y, born: performance.now() })
    settled = false
  }

  function onVisibility(): void {
    visible = document.visibilityState !== 'hidden'
    if (visible) startLoop()
    else stopLoop()
  }

  async function onCompactViewChange(): Promise<void> {
    if (sourceUrl !== undefined) return
    useSnare = compactView.matches
    setLabel()
    source = await loadImage(defaultSourceUrl())
    rebuild()
  }

  function tick(now: number): void {
    frameId = 0
    if (!visible || sim === null) return

    const dt = clamp((now - lastFrame) / 1000, 0.001, 0.033)
    lastFrame = now

    const next = stepPhysics(sim, pointer, waves, now, dt, settled)
    waves = next.waves
    settled = next.settled
    drawSim(context, sim, now)
    frameId = requestAnimationFrame(tick)
  }

  const observer = new ResizeObserver(queueRebuild)
  observer.observe(canvas)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerleave', onPointerLeave)
  canvas.addEventListener('pointerdown', onPointerDown)
  document.addEventListener('visibilitychange', onVisibility)
  compactView.addEventListener('change', onCompactViewChange)

  rebuild()

  return {
    destroy() {
      stopLoop()
      observer.disconnect()
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      canvas.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('visibilitychange', onVisibility)
      compactView.removeEventListener('change', onCompactViewChange)
      canvas.classList.remove('is-ready')
      if (defaultLabel === null) canvas.removeAttribute('aria-label')
      else canvas.setAttribute('aria-label', defaultLabel)
      sim = null
    },
  }
}
