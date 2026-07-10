const COPIED_MS = 1000

/** Swap a button's label to a transient confirmation after copying `data-copy`. */
export function mountCopyOnClick(button: HTMLButtonElement): void {
  const text = button.dataset.copy
  if (!text) throw new Error('copy button is missing data-copy')

  const idleLabel = button.textContent?.trim() || 'Copy'
  let resetTimer = 0

  button.addEventListener('click', () => {
    void navigator.clipboard.writeText(text).then(() => {
      button.textContent = 'Copied'
      button.dataset.copied = ''
      window.clearTimeout(resetTimer)
      resetTimer = window.setTimeout(() => {
        button.textContent = idleLabel
        delete button.dataset.copied
      }, COPIED_MS)
    })
  })
}
