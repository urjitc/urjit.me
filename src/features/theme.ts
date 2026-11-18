const THEME_KEY = 'theme'

/**
 * Wires the colour-theme buttons (each `[data-theme]`): sets `<html data-theme>`, remembers
 * the choice, and keeps the browser's theme colour in step. An inline script in <head>
 * applies the saved theme before the first paint; this only handles changes.
 */
export function mountThemeSwitch(group: HTMLElement): void {
  const root = document.documentElement
  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')

  function render(): void {
    const current = root.dataset.theme ?? 'red'
    for (const button of group.querySelectorAll<HTMLButtonElement>('[data-theme]')) {
      button.setAttribute('aria-pressed', String(button.dataset.theme === current))
    }
    themeColor?.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim())
  }

  group.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-theme]') : null
    const theme = button?.dataset.theme
    if (!theme) return
    root.dataset.theme = theme
    localStorage.setItem(THEME_KEY, theme)
    render()
  })
  render()
}
