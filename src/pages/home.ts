import { requireElement } from '../lib/dom'
import { mountDrumKit } from '../features/drum-kit'
import { mountChoiceOutline } from '../features/choice-outline'
import { mountRowOutline } from '../features/row-outline'
import { mountSignature } from '../features/signature'
import { mountThemeSwitch } from '../features/theme'

mountDrumKit(
  requireElement('kit', HTMLDivElement),
  requireElement('sound-toggle', HTMLButtonElement),
  requireElement('kit-switch', HTMLDivElement),
)

mountSignature(requireElement('signature', SVGSVGElement))

for (const list of document.querySelectorAll<HTMLElement>('.rows')) mountRowOutline(list)
mountThemeSwitch(requireElement('theme-switch', HTMLDivElement))
for (const id of ['kit-switch', 'theme-switch']) mountChoiceOutline(requireElement(id, HTMLDivElement))
