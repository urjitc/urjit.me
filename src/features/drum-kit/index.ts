import { KITS, loadSamples, playDrum, type Kit } from './synth'

const HOLD_MS = 500
/** Gap between a drum's key labels (px). */
const KEY_GAP = 8
/** How far key labels sit inside a drum's rim, clear of its double hoop lines (px).
    A drum can override it with --keys-inset, and move them round with --keys-at. */
const KEY_INSET = 14
const SOUND_KEY = 'sound'
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

/** Unlabelled extras, for anyone who goes looking: a key, the piece it hits and its sound. */
const HIDDEN_KEYS: Record<string, { piece: string; sound: string }> = {
  KeyO: { piece: 'ride', sound: 'bell' },
  KeyD: { piece: 'hihat', sound: 'hihat-open' },
}

// A drum's skin is pushed in by the stick and springs back a touch past rest. Only the
// head moves (its hoop and lugs are static), and moving inward it never runs into the rim.
const DRUM_HIT: Keyframe[] = [
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

// An open hi-hat swings longer and looser than a closed one.
const OPEN_HAT_HIT: Keyframe[] = [
  { scale: 1 },
  { scale: 1.02, offset: 0.08 },
  { scale: 0.993, offset: 0.25 },
  { scale: 1.012, offset: 0.45 },
  { scale: 0.997, offset: 0.7 },
  { scale: 1 },
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
const FACE_MS = 600
const FACE_IN: Keyframe[] = [
  { opacity: 0 },
  { opacity: 1, offset: 0.08 },
  { opacity: 1, offset: 0.7 },
  { opacity: 0 },
]
const FACE_OUT: Keyframe[] = [
  { opacity: 1 },
  { opacity: 0, offset: 0.08 },
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
  // The drawing's moving layers, by name: each drum's sound, plus the pedal's two parts.
  const parts = new Map(
    Array.from(kit.querySelectorAll<HTMLElement>('.part'), (part) => [part.dataset.part, part]),
  )
  // The kick's face: its shared base, its features at rest, and its reactions to a hit.
  const faces = Array.from(kit.querySelectorAll<HTMLElement>('.face'))
  const baseFace = faces.find((face) => face.dataset.face === 'base')
  const restFace = faces.find((face) => face.dataset.face === 'neutral')
  const laughFace = faces.find((face) => face.dataset.face === 'laugh')
  const reactions = faces.filter((face) => face !== baseFace && face !== restFace && face !== laughFace)
  // The last few hits (sound, time), to spot a ba-dum-tss.
  let recent: { sound: string; at: number }[] = []
  let lastReaction: HTMLElement | undefined
  // Key labels that sit on a moving part, by the part's name.
  const riders = new Map<string, HTMLElement>()
  // Each key's label, by key code, to flash it when that key is played.
  const keycaps = new Map<string, HTMLElement>()
  const bellRing = document.createElement('span')
  bellRing.className = 'bell-ring'
  bellRing.setAttribute('aria-hidden', 'true')
  kit.append(bellRing)
  kit.style.setProperty('--hold', `${HOLD_MS}ms`)
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
    const host = hostName && parts.get(hostName)
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
    if (!baseFace || !restFace) return
    // A kick on the "tss" mustn't cut the laugh short.
    if (laughFace?.getAnimations().length) return
    for (const face of faces) for (const animation of face.getAnimations()) animation.cancel()
    const choices = reactions.filter((face) => face !== lastReaction)
    const reaction = choices[Math.floor(Math.random() * choices.length)]
    if (!reaction) return
    lastReaction = reaction
    const timing = { duration: FACE_MS, delay: PEDAL_MS * PEDAL_IMPACT }
    restFace.animate(FACE_OUT, timing)
    reaction.animate(FACE_IN, timing)
    for (const face of [baseFace, restFace, reaction]) face.animate(FACE_HIT, timing)
  }

  /** The face laughs: its features crossfade to the laugh, and the head shakes. */
  function laugh(): void {
    if (!baseFace || !restFace || !laughFace) return
    for (const face of faces) for (const animation of face.getAnimations()) animation.cancel()
    restFace.animate(FACE_OUT, LAUGH_MS)
    laughFace.animate(FACE_IN, LAUGH_MS)
    if (reducedMotion.matches) return
    for (const face of [baseFace, restFace, laughFace]) face.animate(LAUGH_SHAKE, { duration: LAUGH_MS, easing: 'ease-out' })
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
    if (sound) listen(sound)
    if (reducedMotion.matches) return
    if (sound === 'bell') {
      parts.get('ride')?.animate(BELL_HIT, 260)
      bellRing.animate(BELL_RING, { duration: 650, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' })
      return
    }
    if (sound === 'hihat-open') {
      for (const target of [piece, parts.get('hihat')]) target?.animate(OPEN_HAT_HIT, 900)
      return
    }
    // The drum's head and the piece (its icon) move together; the kick also works its pedal.
    const keyframes = piece.classList.contains('cymbal') ? CYMBAL_HIT : DRUM_HIT
    const timing = { duration: 420, easing: 'ease-out' }
    // The kick head waits for the beater to land on it.
    const isKick = piece.dataset.sound === 'kick'
    const headTiming = { ...timing, delay: isKick ? PEDAL_MS * PEDAL_IMPACT : 0 }
    piece.animate(keyframes, headTiming)
    parts.get(piece.dataset.sound)?.animate(keyframes, headTiming)
    if (isKick) {
      for (const [name, keyframes] of [['beater', BEATER_HIT], ['footboard', FOOTBOARD_HIT]] as const) {
        parts.get(name)?.animate(keyframes, PEDAL_MS)
        riders.get(name)?.animate(keyframes, PEDAL_MS)
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
