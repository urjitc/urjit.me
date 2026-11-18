/**
 * Marks a button group's chosen option (its `[aria-pressed="true"]` button) with one hairline
 * outline that glides to each new choice, like the lists' row outline. Layout changes (the
 * font loading, a resize) move it instantly; only a change of choice animates.
 */
export function mountChoiceOutline(group: HTMLElement): void {
  const outline = document.createElement('span')
  outline.className = 'choice-outline'
  outline.setAttribute('aria-hidden', 'true')
  group.append(outline)

  function place(animate: boolean): void {
    const chosen = group.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (!chosen) return
    if (!animate) outline.style.transition = 'none'
    // Measured on screen, relative to the group, so transforms on the way never skew it.
    const box = chosen.getBoundingClientRect()
    const frame = group.getBoundingClientRect()
    outline.style.translate = `${box.left - frame.left}px ${box.top - frame.top}px`
    outline.style.width = `${box.width}px`
    outline.style.height = `${box.height}px`
    if (!animate) {
      void outline.offsetWidth // commit the jump before transitions return
      outline.style.transition = ''
    }
  }

  new MutationObserver(() => place(true)).observe(group, { subtree: true, attributeFilter: ['aria-pressed'] })
  new ResizeObserver(() => place(false)).observe(group)
  place(false)
}
