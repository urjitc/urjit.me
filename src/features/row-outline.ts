/**
 * Gives a `.rows` list one hairline outline that glides to whichever row is hovered or
 * focused, instead of each row lighting up on its own. It fades in on the first row,
 * slides between rows, and fades out when the pointer or focus leaves the list. On touch,
 * where nothing hovers, it shows only while a row is pressed.
 */
export function mountRowOutline(list: HTMLElement): void {
  const outline = document.createElement('li')
  outline.className = 'row-outline'
  outline.setAttribute('aria-hidden', 'true')
  list.append(outline)

  function moveTo(row: HTMLElement): void {
    // Showing from hidden: jump into place first, so it fades in there instead of sliding.
    const appearing = !outline.classList.contains('shown')
    if (appearing) outline.style.transition = 'none'
    // Measured on screen, relative to the list: offsetTop/Left would be relative to the row's
    // own <li> while its scroll-in animation transforms it.
    const box = row.getBoundingClientRect()
    const frame = list.getBoundingClientRect()
    outline.style.translate = `${box.left - frame.left}px ${box.top - frame.top}px`
    outline.style.width = `${box.width}px`
    outline.style.height = `${box.height}px`
    if (appearing) {
      void outline.offsetWidth // commit the jump before transitions return
      outline.style.transition = ''
      outline.classList.add('shown')
    }
  }

  const rowOf = (target: EventTarget | null) =>
    target instanceof Element ? target.closest<HTMLElement>('.row') : null

  list.addEventListener('pointerover', (event) => {
    // Touch has no hover: a tap would leave the outline stuck on its row.
    if (event.pointerType === 'touch') return
    const row = rowOf(event.target)
    if (row) moveTo(row)
  })
  // On touch, the outline is press feedback instead: it shows while the finger is down.
  list.addEventListener('pointerdown', (event) => {
    const row = rowOf(event.target)
    if (event.pointerType === 'touch' && row) moveTo(row)
  })
  for (const type of ['pointerup', 'pointercancel'] as const) {
    list.addEventListener(type, (event) => {
      if (event.pointerType === 'touch') setTimeout(() => outline.classList.remove('shown'), 150)
    })
  }
  list.addEventListener('pointerleave', () => {
    // Keyboard focus keeps it; a row merely clicked doesn't.
    if (!list.querySelector(':focus-visible')) outline.classList.remove('shown')
  })
  list.addEventListener('focusin', (event) => {
    const row = rowOf(event.target)
    if (row?.matches(':focus-visible')) moveTo(row)
  })
  list.addEventListener('focusout', (event) => {
    const next = event.relatedTarget
    if (!(next instanceof Node && list.contains(next))) outline.classList.remove('shown')
  })
}
