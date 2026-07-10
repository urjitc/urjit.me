import { requireElement } from '../lib/dom'
import { mountAsciiDrum } from '../features/ascii-drum'
import '../styles/base.css'
import './home.css'

const canvas = requireElement('ascii-canvas', HTMLCanvasElement)
const fallback = requireElement('ascii-fallback', HTMLPreElement)

void mountAsciiDrum({ canvas, fallback })
