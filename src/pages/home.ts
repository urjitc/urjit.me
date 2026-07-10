import { requireElement } from '../lib/dom'
import { mountCopyOnClick } from '../lib/copy-on-click'
import { mountAsciiDrum } from '../features/ascii-drum'
import '../styles/base.css'
import './home.css'

const canvas = requireElement('ascii-canvas', HTMLCanvasElement)
const fallback = requireElement('ascii-fallback', HTMLPreElement)

mountCopyOnClick(requireElement('copy-email', HTMLButtonElement))
void mountAsciiDrum({ canvas, fallback })
