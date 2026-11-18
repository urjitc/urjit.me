import { DRUM_HIT, SOUND_KEY } from '../features/drum-kit'
import { playDrum } from '../features/drum-kit/synth'
import { requireElement } from '../lib/dom'

/**
 * The 404 page: its 0 is a drum head that plays a kick when tapped, the Trap kit's, which is
 * synthesised so nothing has to load. It follows the homepage's sound setting.
 */
const zero = requireElement('zero', HTMLButtonElement)
const head = zero.querySelector<SVGElement>('.head')
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')

document
  .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  ?.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--bg').trim())

function hit(): void {
  if (localStorage.getItem(SOUND_KEY) !== 'off') playDrum('trap', 'kick')
  if (!reducedMotion.matches) head?.animate(DRUM_HIT, { duration: 420, easing: 'ease-out' })
}

// Pointers play on press, like the kit; Enter and Space arrive as a click with no pointer.
zero.addEventListener('pointerdown', (event) => {
  if (event.button === 0) hit()
})
zero.addEventListener('click', (event) => {
  if (event.detail === 0) hit()
})
