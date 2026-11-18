import { KITS, loadSamples, playDrum, wakeAudio, type Kit } from './synth'

const HOLD_MS = 500
/** How long the drumstick cursor shows a stick down after a click (ms). */
const STICK_MS = 110
/** Gap between a drum's key labels (px). */
const KEY_GAP = 8
/** How far key labels sit inside a drum's rim, clear of its double hoop lines (px).
    A drum can override it with --keys-inset, and move them round with --keys-at. */
const KEY_INSET = 14
export const SOUND_KEY = 'sound'
const KIT_KEY = 'kit'

/** Physical keys (layout-independent `event.code`) laid out left to right like the kit. */
const KEYS: Record<string, string> = {
  KeyX: 'hihat',
  KeyC: 'hihat',
  KeyV: 'snare',
  KeyB: 'snare',
  Space: 'kick',
  KeyF: 'tom-left',
  KeyG: 'tom-left',
  KeyH: 'tom-right',
  KeyJ: 'tom-right',
  KeyN: 'floor-tom',
  KeyM: 'floor-tom',
  KeyK: 'ride',
}

/** An unlabelled extra for anyone who goes looking: a key, the piece it hits and its sound. */
const HIDDEN_KEYS: Record<string, { piece: string; sound: string }> = {
  KeyO: { piece: 'ride', sound: 'bell' },
}

// A drum's skin is pushed in by the stick and springs back a touch past rest. Only the
// head moves (its hoop and lugs are static), and moving inward it never runs into the rim.
export const DRUM_HIT: Keyframe[] = [
  { scale: 1 },
  { scale: 0.965, offset: 0.15, easing: 'ease-out' },
  { scale: 1.012, offset: 0.45, easing: 'ease-in-out' },
  { scale: 0.996, offset: 0.72, easing: 'ease-in-out' },
  { scale: 1 },
]

// A cymbal shimmers: a small, quick pulse that keeps its edge near where it's drawn.
const CYMBAL_HIT: Keyframe[] = [
  { scale: 1 },
  { scale: 1.012, offset: 0.12 },
  { scale: 0.997, offset: 0.35 },
  { scale: 1.005, offset: 0.6 },
  { scale: 1 },
]

// The ride's bell rings rather than washes: the cymbal barely moves, and a hairline ring
// ripples out from the bell instead.
const BELL_HIT: Keyframe[] = [{ scale: 1 }, { scale: 1.006, offset: 0.15 }, { scale: 1 }]
const BELL_RING: Keyframe[] = [
  { scale: 1, opacity: 0.9 },
  { scale: 2.6, opacity: 0 },
]

// Ba-dum-tss: two snare hits and then the crash, each within RIMSHOT_GAP ms of the last (a
// kick played along is ignored). The face laughs at the joke for LAUGH_MS, shaking its head.
const RIMSHOT_GAP = { min: 60, max: 650 }
const LAUGH_MS = 1800
const LAUGH_SHAKE: Keyframe[] = [
  { rotate: '0deg' },
  { rotate: '-2deg', offset: 0.1 },
  { rotate: '2deg', offset: 0.22 },
  { rotate: '-1.5deg', offset: 0.34 },
  { rotate: '1.5deg', offset: 0.46 },
  { rotate: '-0.5deg', offset: 0.6 },
  { rotate: '0deg' },
]

// A pedal stroke, seen from above, using classic animation principles: a small wind-up
// (anticipation), a fast accelerating strike, a brief hold on the head (contact), then
// overshoot back past rest and a damped bounce (follow-through). Both parts pivot (hub,
// heel); the footboard mirrors the beater.
const PEDAL_MS = 480
/** When the beater meets the head, as a fraction of PEDAL_MS; the kick head pops then. */
const PEDAL_IMPACT = 0.12

const BEATER_HIT: Keyframe[] = [
  { scale: '1 1', easing: 'ease-out' },
  { scale: '1 0.78', offset: 0.05, easing: 'cubic-bezier(0.55, 0, 1, 0.45)' },
  { scale: '1 1.4', offset: PEDAL_IMPACT, easing: 'linear' },
  { scale: '1 1.38', offset: 0.17, easing: 'cubic-bezier(0, 0.55, 0.45, 1)' },
  { scale: '1 0.86', offset: 0.36, easing: 'ease-in-out' },
  { scale: '1 1.05', offset: 0.55, easing: 'ease-in-out' },
  { scale: '1 0.98', offset: 0.75, easing: 'ease-in-out' },
  { scale: '1 1' },
]

const FOOTBOARD_HIT: Keyframe[] = [
  { scale: '1 1', easing: 'ease-out' },
  { scale: '1 1.04', offset: 0.05, easing: 'cubic-bezier(0.55, 0, 1, 0.45)' },
  { scale: '1 0.95', offset: PEDAL_IMPACT, easing: 'linear' },
  { scale: '1 0.955', offset: 0.17, easing: 'cubic-bezier(0, 0.55, 0.45, 1)' },
  { scale: '1 1.025', offset: 0.36, easing: 'ease-in-out' },
  { scale: '1 0.99', offset: 0.55, easing: 'ease-in-out' },
  { scale: '1 1' },
]

// The face on the kick head flinches when the beater lands: it squashes toward the chin and
// springs back, while a random reaction's features (never the same twice running) crossfade
// in over the resting ones and back out over FACE_MS. The hair and outline never change.
// Kicked again mid-reaction, the face re-squashes from where it is and the showing reaction
// fades out as the next fades in. The faster the kicks, the shorter those fades: each is at
// most FACE_FADE_SHARE of the time since the last kick, so even a drum roll shows every face
// whole, cut to cut, instead of a blur of half-faded faces.
const FACE_MS = 600
// Playing with the sound off nudges the sound button once per visit (it's small, and the
// drums looking hit but silent would otherwise read as broken).
const NUDGE: Keyframe[] = [
  { scale: 1 },
  { scale: 1.15, offset: 0.25, easing: 'ease-out' },
  { scale: 1, offset: 0.5, easing: 'ease-in-out' },
  { scale: 1.15, offset: 0.75, easing: 'ease-out' },
  { scale: 1 },
]
const FACE_FADE_MS = 48
const FACE_SWAP_MS = 90
const FACE_FADE_SHARE = 0.2
const FACE_AWAY: Keyframe[] = [{ opacity: 1 }, { opacity: 0 }]
/** A reaction's features: in over `fade` (a fraction of the duration), held, then out. */
const faceIn = (fade: number): Keyframe[] => [
  { opacity: 0 },
  { opacity: 1, offset: fade },
  { opacity: 1, offset: 0.7 },
  { opacity: 0 },
]
/** The resting features, the mirror of faceIn. */
const faceOut = (fade: number): Keyframe[] => [
  { opacity: 1 },
  { opacity: 0, offset: fade },
  { opacity: 0, offset: 0.7 },
  { opacity: 1 },
]
const FACE_HIT: Keyframe[] = [
  { scale: '1 1' },
  { scale: '1.05 0.9', offset: 0.08, easing: 'ease-out' },
  { scale: '0.98 1.03', offset: 0.35, easing: 'ease-in-out' },
  { scale: '1.01 0.99', offset: 0.65, easing: 'ease-in-out' },
  { scale: '1 1' },
]

/** Groups elements by a key (a part or face name); elements without one are left out. */
function groupBy(elements: Iterable<HTMLElement>, key: (element: HTMLElement) => string | undefined) {
  const groups = new Map<string, HTMLElement[]>()
  for (const element of elements) {
    const name = key(element)
    if (name) groups.set(name, [...(groups.get(name) ?? []), element])
  }
  return groups
}

/**
 * Plays the same animation on every element given (a part's copy in each drawing), from
 * wherever each one is now: a running animation of the same properties is cancelled and the
 * new one starts from its current on-screen values. So hits in quick succession re-strike
 * mid-motion instead of snapping back to rest first. A delay defers the whole swap, so the
 * running animation keeps moving until then rather than freezing.
 */
function animateAll(
  elements: readonly HTMLElement[] | undefined,
  keyframes: Keyframe[],
  timing: number | KeyframeAnimationOptions,
): void {
  const props = [...new Set(keyframes.flatMap(Object.keys))].filter(
    (key) => !['offset', 'easing', 'composite'].includes(key),
  )
  const { delay = 0, ...options } = typeof timing === 'number' ? { duration: timing } : timing
  if (delay) {
    setTimeout(() => animateAll(elements, keyframes, options), delay)
    return
  }
  // Read every current value before cancelling anything, so styles are computed once.
  const plans = (elements ?? []).map((element) => {
    const running = element
      .getAnimations()
      .filter((animation) => animation.effect instanceof KeyframeEffect &&
        animation.effect.getKeyframes().some((frame) => props.some((prop) => prop in frame)))
    if (!running.length) return { element, running, first: keyframes[0] }
    const style = getComputedStyle(element)
    const now = Object.fromEntries(props.map((prop) => [prop, style.getPropertyValue(prop)]))
    return { element, running, first: { ...keyframes[0], ...now } }
  })
  for (const { element, running, first } of plans) {
    for (const animation of running) animation.cancel()
    element.animate([first ?? {}, ...keyframes.slice(1)], options)
  }
}

/**
 * Sets each drum's key labels on an arc just inside its rim, each turned to follow the
 * curve and spaced by its real width. They sit at the bottom of the drum on screen unless
 * its --keys-at angle says otherwise (0deg is the right, 90deg the bottom, -90deg the top),
 * whatever the hit area's own --angle.
 * Labels are hidden (zero size) without a keyboard, so there's nothing to place then.
 */
function placeKeys(keyLabels: Map<HTMLElement, HTMLElement[]>): void {
  for (const [piece, labels] of keyLabels) {
    const widths = labels.map((label) => label.offsetWidth)
    if (!widths.some(Boolean)) continue
    const style = getComputedStyle(piece)
    const centre = ((parseFloat(style.getPropertyValue('--keys-at')) || 90) * Math.PI) / 180
    // The hit area is turned by --angle; work in screen angles, then turn back into its frame.
    const turn = ((parseFloat(style.getPropertyValue('--angle')) || 0) * Math.PI) / 180
    const inset = parseFloat(style.getPropertyValue('--keys-inset')) || KEY_INSET
    const height = Math.max(...labels.map((label) => label.offsetHeight))
    const rx = piece.offsetWidth / 2
    const ry = piece.offsetHeight / 2
    // Radius (as a fraction of the drum) that keeps the labels inside the rim.
    const k = 1 - (height / 2 + inset) / ry
    // On the lower half, going left to right means turning clockwise; on the upper half, back.
    const below = Math.sin(centre) >= 0
    const total = widths.reduce((sum, width) => sum + width, 0) + KEY_GAP * (widths.length - 1)
    let along = -total / 2
    labels.forEach((label, index) => {
      const middle = along + widths[index]! / 2
      along += widths[index]! + KEY_GAP
      // Arc length to angle, measured on the arc's own radius.
      const theta = centre + (below ? -1 : 1) * (middle / ((k * (rx + ry)) / 2))
      const local = theta - turn
      label.style.left = `${50 + 50 * k * Math.cos(local)}%`
      label.style.top = `${50 + 50 * k * Math.sin(local)}%`
      // Tangent to the rim, reading upright on screen.
      label.style.rotate = `${theta - (below ? Math.PI / 2 : -Math.PI / 2) - turn}rad`
    })
  }
}

/**
 * Wires up the drum kit. Every `.piece` plays its `data-sound` and wobbles when hit.
 * Tapping a linked drum only plays it; holding it for HOLD_MS and releasing opens its
 * href (mailto for the snare). Cmd/Ctrl-click and keyboard Enter follow the link
 * directly; letter keys play the kit, and Space is always the kick.
 */
export function mountDrumKit(
  kit: HTMLElement,
  soundToggle: HTMLButtonElement,
  kitSwitch: HTMLElement,
): void {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
  // The drawings' moving layers, by name (each drum's sound, plus the pedal's two parts):
  // one per drawing, wide and portrait, moved together; only the one on screen shows.
  const parts = groupBy(kit.querySelectorAll<HTMLElement>('.part'), (part) => part.dataset.part)
  // The kick's face, in each drawing: its shared base, its features at rest, and reactions.
  const faces = Array.from(kit.querySelectorAll<HTMLElement>('.face'))
  const byFace = groupBy(faces, (face) => face.dataset.face)
  const baseFaces = byFace.get('base') ?? []
  const restFaces = byFace.get('neutral') ?? []
  const laughFaces = byFace.get('laugh') ?? []
  const reactions = [...byFace.keys()].filter((name) => !['base', 'neutral', 'laugh'].includes(name))
  // The last few hits (sound, time), to spot a ba-dum-tss.
  let recent: { sound: string; at: number }[] = []
  let lastReaction: string | undefined
  let lastKickAt = -Infinity
  let nudged = false
  // Key labels that sit on a moving part, by the part's name.
  const riders = new Map<string, HTMLElement>()
  // Each key's label, by key code, to flash it when that key is played.
  const keycaps = new Map<string, HTMLElement>()
  const bellRing = document.createElement('span')
  bellRing.className = 'bell-ring'
  bellRing.setAttribute('aria-hidden', 'true')
  kit.append(bellRing)
  kit.style.setProperty('--hold', `${HOLD_MS}ms`)
  // Each linked drum gets a ring that draws itself round its icon while held (drum-kit.css).
  for (const link of kit.querySelectorAll('a.piece')) {
    link.insertAdjacentHTML(
      'beforeend',
      '<svg class="hold-ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="48" /></svg>',
    )
  }
  // Label each drum with its keys (shown only where there's a keyboard, via CSS).
  const keyLabels = new Map<HTMLElement, HTMLElement[]>()
  for (const piece of kit.querySelectorAll<HTMLElement>('.piece')) {
    const keys = document.createElement('span')
    keys.className = 'keys'
    keys.setAttribute('aria-hidden', 'true')
    const labels = Object.keys(KEYS)
      .filter((code) => KEYS[code] === piece.dataset.sound)
      .map((code) => {
        const key = document.createElement('kbd')
        key.textContent = code.replace(/^Key/, '')
        keycaps.set(code, key)
        return key
      })
    keys.append(...labels)
    // Screen readers announce the shortcuts the labels show.
    piece.setAttribute('aria-keyshortcuts', labels.map((key) => key.textContent).join(' '))
    // A drum can put its keys on a part of the drawing instead (the kick, on its pedal),
    // where they ride along with that part.
    const hostName = piece.dataset.keysOn
    const host = hostName && parts.get(hostName)?.[0]
    if (hostName && host) {
      keys.classList.add('on-part')
      keys.style.cssText = host.style.cssText
      kit.append(keys)
      riders.set(hostName, keys)
    } else {
      piece.append(keys)
      keyLabels.set(piece, labels)
    }
  }
  placeKeys(keyLabels)
  new ResizeObserver(() => placeKeys(keyLabels)).observe(kit)
  let soundOn = localStorage.getItem(SOUND_KEY) !== 'off'
  const savedKit = localStorage.getItem(KIT_KEY)
  let currentKit: Kit = KITS.find((name) => name === savedKit) ?? 'rock'
  let hold: { piece: HTMLAnchorElement; ready: boolean; timer: number } | null = null
  // The drumstick cursor (drum-kit.css): each click brings the other stick down.
  let stick: 'left' | 'right' = 'right'
  let stickTimer: number | undefined
  // Fetch the kit in play once the page's own files are in, so samples never compete with
  // the first paint; with sound off, nothing loads until it's turned on.
  const loadKit = () => {
    if (soundOn) loadSamples(currentKit)
  }
  if (document.readyState === 'complete') loadKit()
  else addEventListener('load', loadKit, { once: true })

  function renderToggle(): void {
    const label = soundToggle.querySelector('span')
    if (label) label.textContent = soundOn ? 'Sound on' : 'Sound off'
    soundToggle.setAttribute('aria-pressed', String(soundOn))
  }

  function renderKit(): void {
    for (const button of kitSwitch.querySelectorAll<HTMLButtonElement>('[data-kit]')) {
      button.setAttribute('aria-pressed', String(button.dataset.kit === currentKit))
    }
  }

  function setKit(next: Kit): void {
    currentKit = next
    localStorage.setItem(KIT_KEY, next)
    renderKit()
    if (soundOn) loadSamples(next)
  }

  /** Crossfades the kick's face to a reaction as the beater lands, squashing it as it goes. */
  function flinch(): void {
    // A kick on the "tss" mustn't cut the laugh short.
    if (laughFaces.some((face) => face.getAnimations().length)) return
    const choices = reactions.filter((name) => name !== lastReaction)
    const reaction = choices[Math.floor(Math.random() * choices.length)]
    if (!reaction) return
    lastReaction = reaction
    const reacting = byFace.get(reaction) ?? []
    const now = performance.now()
    const quick = (now - lastKickAt) * FACE_FADE_SHARE
    lastKickAt = now
    const fade = Math.min(FACE_FADE_MS, quick) / FACE_MS
    // The face changes as the beater lands; until then the last reaction plays on.
    setTimeout(() => {
      fadeAllBut(reaction, Math.min(FACE_SWAP_MS, quick))
      animateAll(restFaces, faceOut(fade), FACE_MS)
      animateAll(reacting, faceIn(fade), FACE_MS)
      animateAll([...baseFaces, ...restFaces, ...reacting], FACE_HIT, FACE_MS)
    }, PEDAL_MS * PEDAL_IMPACT)
  }

  /** Fades out any reaction still showing from an earlier kick, other than `keep`. */
  function fadeAllBut(keep: string, timing: number | KeyframeAnimationOptions): void {
    const showing = faces.filter(
      ({ dataset: { face } }) => face !== keep && face !== 'base' && face !== 'neutral',
    ).filter((face) => Number(getComputedStyle(face).opacity) > 0)
    animateAll(showing, FACE_AWAY, timing)
  }

  /** The face laughs: its features crossfade to the laugh, and the head shakes. */
  function laugh(): void {
    fadeAllBut('laugh', FACE_SWAP_MS)
    animateAll(restFaces, faceOut(0.08), LAUGH_MS)
    animateAll(laughFaces, faceIn(0.08), LAUGH_MS)
    if (reducedMotion.matches) return
    animateAll([...baseFaces, ...restFaces, ...laughFaces], LAUGH_SHAKE, { duration: LAUGH_MS, easing: 'ease-out' })
  }

  /** Keeps the last three non-kick hits and laughs when they make a ba-dum-tss. */
  function listen(sound: string): void {
    if (sound === 'kick') return
    recent = [...recent, { sound, at: performance.now() }].slice(-3)
    const [ba, dum, tss] = recent
    if (!ba || !dum || !tss) return
    const gaps = [dum.at - ba.at, tss.at - dum.at]
    const inTime = gaps.every((gap) => gap >= RIMSHOT_GAP.min && gap <= RIMSHOT_GAP.max)
    if (inTime && ba.sound === 'snare' && dum.sound === 'snare' && tss.sound === 'ride') {
      recent = []
      laugh()
    }
  }

  /** Plays a piece (its own sound unless another is given) and moves it to match. */
  function hit(piece: HTMLElement, sound = piece.dataset.sound): void {
    if (soundOn && sound) playDrum(currentKit, sound)
    else if (!nudged) {
      nudged = true
      if (!reducedMotion.matches) soundToggle.animate(NUDGE, { duration: 900 })
    }
    if (sound) listen(sound)
    if (reducedMotion.matches) return
    if (sound === 'bell') {
      animateAll(parts.get('ride'), BELL_HIT, 260)
      bellRing.animate(BELL_RING, { duration: 650, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' })
      return
    }
    // The drum's head and the piece (its icon) move together; the kick also works its pedal.
    const keyframes = piece.classList.contains('cymbal') ? CYMBAL_HIT : DRUM_HIT
    const timing = { duration: 420, easing: 'ease-out' }
    // The kick head waits for the beater to land on it.
    const isKick = piece.dataset.sound === 'kick'
    const headTiming = { ...timing, delay: isKick ? PEDAL_MS * PEDAL_IMPACT : 0 }
    animateAll([piece], keyframes, headTiming)
    animateAll(parts.get(piece.dataset.sound ?? ''), keyframes, headTiming)
    if (isKick) {
      for (const [name, keyframes] of [['beater', BEATER_HIT], ['footboard', FOOTBOARD_HIT]] as const) {
        animateAll(parts.get(name), keyframes, PEDAL_MS)
        const rider = riders.get(name)
        if (rider) animateAll([rider], keyframes, PEDAL_MS)
      }
      flinch()
    }
  }

  /** Opens a held drum's link: web links in a new tab, mailto in the mail app. */
  function activate(piece: HTMLAnchorElement): void {
    if (piece.protocol === 'mailto:') location.href = piece.href
    else window.open(piece.href, '_blank', 'noopener')
  }

  function endHold(): void {
    if (!hold) return
    clearTimeout(hold.timer)
    delete hold.piece.dataset.holding
    delete hold.piece.dataset.ready
    hold = null
  }

  kit.addEventListener('pointerdown', (event) => {
    const piece = (event.target as Element).closest<HTMLElement>('.piece')
    if (!piece || event.button !== 0) return
    hit(piece)
    if (event.pointerType !== 'touch') {
      stick = stick === 'left' ? 'right' : 'left'
      kit.dataset.stick = stick
      clearTimeout(stickTimer)
      stickTimer = setTimeout(() => delete kit.dataset.stick, STICK_MS)
    }
    if (!(piece instanceof HTMLAnchorElement)) return
    endHold()
    piece.dataset.holding = ''
    const timer = setTimeout(() => {
      if (!hold) return
      hold.ready = true
      piece.dataset.ready = ''
    }, HOLD_MS)
    hold = { piece, ready: false, timer }
  })

  // Release after a full hold opens the link. pointerup still counts as a user gesture,
  // so window.open is not blocked as a popup.
  kit.addEventListener('pointerup', () => {
    wakeAudio()
    if (hold?.ready) activate(hold.piece)
    endHold()
  })
  kit.addEventListener('pointercancel', endHold)
  kit.addEventListener('pointerleave', endHold)
  // Stop long-press menus and link previews on touch while holding.
  kit.addEventListener('contextmenu', (event) => {
    if (hold) event.preventDefault()
  })

  kit.addEventListener('click', (event) => {
    const piece = (event.target as Element).closest<HTMLElement>('.piece')
    if (!piece) return
    if (event.detail === 0) {
      // Keyboard Enter/Space on a focused drum: play it, then links follow their href.
      hit(piece)
      return
    }
    if (event.metaKey || event.ctrlKey || event.shiftKey) return // background tab
    event.preventDefault()
  })

  document.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    const hidden = HIDDEN_KEYS[event.code]
    const name = KEYS[event.code] ?? hidden?.piece
    if (!name) return
    event.preventDefault() // Space never scrolls the page
    if (event.repeat) return
    const piece = kit.querySelector<HTMLElement>(`[data-sound="${name}"]`)
    if (piece) hit(piece, hidden?.sound)
    keycaps.get(event.code)?.classList.add('struck')
  })
  document.addEventListener('keyup', (event) => keycaps.get(event.code)?.classList.remove('struck'))
  // A key released in another window never sends keyup here.
  addEventListener('blur', () => {
    for (const key of keycaps.values()) key.classList.remove('struck')
  })

  // A mouse or touch press shouldn't leave keyboard focus behind: the next key press
  // would draw the focus ring on it. Tabbing (detail 0) keeps focus as normal.
  kit.parentElement?.addEventListener('click', (event) => {
    if (event.detail === 0) return
    const control = (event.target as Element).closest<HTMLElement>('button, a')
    control?.blur()
  })

  soundToggle.addEventListener('click', () => {
    soundOn = !soundOn
    localStorage.setItem(SOUND_KEY, soundOn ? 'on' : 'off')
    renderToggle()
    if (soundOn) loadSamples(currentKit)
  })
  kitSwitch.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLElement>('[data-kit]')
    const next = KITS.find((name) => name === button?.dataset.kit)
    if (next) setKit(next)
  })

  renderToggle()
  renderKit()
}
