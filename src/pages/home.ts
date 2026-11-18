import { requireElement } from '../lib/dom'
import { mountDrumKit } from '../features/drum-kit'
import { mountLooper } from '../features/looper'
import { mountJamWall } from '../features/looper/wall'
import { mountChoiceOutline } from '../features/choice-outline'
import { mountRowOutline } from '../features/row-outline'
import { mountSignature } from '../features/signature'
import { mountThemeSwitch } from '../features/theme'

const kit = mountDrumKit(
  requireElement('kit', HTMLDivElement),
  requireElement('sound-toggle', HTMLButtonElement),
  requireElement('kit-switch', HTMLDivElement),
)
const looperRoot = requireElement('looper', HTMLDivElement)
// The wall's Post button shows once there's a loop, so the looper tells it of changes.
let wall: { refresh(): void } | undefined
const looper = mountLooper(looperRoot, kit, () => wall?.refresh())
wall = mountJamWall(looperRoot, looper, kit)

mountSignature(requireElement('signature', SVGSVGElement))

for (const list of document.querySelectorAll<HTMLElement>('.rows')) mountRowOutline(list)
mountThemeSwitch(requireElement('theme-switch', HTMLDivElement))
for (const id of ['kit-switch', 'theme-switch']) mountChoiceOutline(requireElement(id, HTMLDivElement))
