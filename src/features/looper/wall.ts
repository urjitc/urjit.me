import type { DrumKit } from '../drum-kit'
import { decodeHits, KITS } from './jam'
import type { Looper } from './index'

type Jam = { id: string; name: string; pattern: string; kit: string; bpm: number; created_at: number }

const KIT_NAMES: Record<string, string> = { rock: 'Rock', trap: 'Trap', '8bit': '8-bit' }
const ago = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' })
/** How long a passing message stays on the info line before the beat dots come back (ms). */
const NOTE_MS = 4000

/** "3 min. ago", "yesterday": the largest unit that fits. */
function timeAgo(at: number): string {
  const seconds = (at - Date.now()) / 1000
  const units: [Intl.RelativeTimeFormatUnit, number][] = [['day', 86400], ['hour', 3600], ['minute', 60]]
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return ago.format(Math.round(seconds / size), unit)
  }
  return 'just now'
}

async function api<T>(init?: RequestInit): Promise<T> {
  const response = await fetch('/api/jams', init)
  const body = await response.json()
  if (!response.ok) throw new Error((body as { error?: string }).error ?? 'Something went wrong.')
  return body as T
}

/**
 * The public jam wall, in the looper under the kit. Post swaps the buttons for a name field
 * (required, up to 24 characters; Escape backs out). Posting is optimistic: your jam goes
 * to the top of the list at once while the server checks its name, which can take seconds
 * (worker/jams.ts); if the name's refused, the row fades out and the name goes back in the
 * field. Nobody else sees a jam until it passes. Jams folds open the list, where tapping a
 * jam plays it on the kit right above (tapping again stops it). Jams are for listening:
 * playing one leaves your own loop alone. The list is fetched as the page loads, so Jams
 * opens at once; each open fetches it afresh for the next.
 */
export function mountJamWall(root: HTMLElement, looper: Looper, kit: DrumKit): { refresh(): void } {
  const buttons = root.querySelector<HTMLElement>('.loop-buttons')!
  const postButton = root.querySelector<HTMLButtonElement>('[data-wall="post"]')!
  const toggle = root.querySelector<HTMLButtonElement>('[data-wall="toggle"]')!
  const form = root.querySelector<HTMLFormElement>('.post-form')!
  const nameInput = form.querySelector('input')!
  const submit = form.querySelector<HTMLButtonElement>('[type="submit"]')!
  const status = root.querySelector<HTMLElement>('.loop-status')!
  const drawer = root.querySelector<HTMLElement>('.jam-drawer')!
  const list = drawer.querySelector('ul')!
  /** Your posted jams still being checked, kept at the top when the list reloads. */
  const pending = new Set<HTMLLIElement>()
  let noteTimer: number | undefined
  /** The wall as last fetched; null until the first fetch succeeds. */
  let latest: Jam[] | null = null
  let loading: Promise<void> | null = null

  function load(): Promise<void> {
    loading ??= api<Jam[]>()
      .then((jams) => void (latest = jams), () => {})
      .finally(() => (loading = null))
    return loading
  }

  /** Shows a message on the looper's info line; a passing one clears itself. */
  function say(message: string, passing = false): void {
    clearTimeout(noteTimer)
    status.textContent = message
    if (passing) noteTimer = setTimeout(() => (status.textContent = ''), NOTE_MS)
  }

  function refresh(): void {
    postButton.inert = looper.pattern() === '' || root.dataset.listening === 'true'
    // A jam stops when anything else plays: unmark its row.
    if (root.dataset.listening !== 'true') {
      for (const row of list.querySelectorAll('[aria-pressed="true"]')) row.setAttribute('aria-pressed', 'false')
    }
  }

  function showForm(shown: boolean): void {
    form.inert = !shown
    buttons.inert = shown
    if (shown) nameInput.focus()
  }

  async function showList(): Promise<void> {
    toggle.setAttribute('aria-expanded', 'true')
    drawer.inert = false
    if (latest) void load()
    else {
      say('Loading jams…')
      await load()
      say('')
    }
    list.replaceChildren(...pending, ...(latest ?? []).map(row))
    if (!latest) say('Couldn’t load the jams.', true)
    else if (!latest.length && !pending.size) say('No jams yet. Record the first!', true)
  }

  function row(jam: Jam): HTMLLIElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'jam'
    button.setAttribute('aria-pressed', 'false')
    const name = document.createElement('span')
    name.textContent = jam.name
    const meta = document.createElement('span')
    meta.className = 'jam-meta'
    meta.textContent = `${KIT_NAMES[jam.kit] ?? jam.kit} · ${jam.bpm} BPM · ${timeAgo(jam.created_at)}`
    button.append(name, meta)
    button.addEventListener('click', () => {
      if (button.getAttribute('aria-pressed') === 'true') return looper.stop()
      const hits = decodeHits(jam.pattern, jam.bpm)
      if (!hits) return
      const known = KITS.find((name) => name === jam.kit)
      if (known) kit.setKit(known)
      looper.listen(hits, jam.bpm)
      button.setAttribute('aria-pressed', 'true')
    })
    const item = document.createElement('li')
    item.append(button)
    return item
  }

  postButton.addEventListener('click', () => showForm(true))
  form.querySelector('[data-wall="cancel"]')!.addEventListener('click', () => showForm(false))
  form.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') showForm(false)
  })
  // Post stays off until there's a name (spaces alone don't count).
  nameInput.addEventListener('input', () => (submit.disabled = !nameInput.value.trim()))
  toggle.addEventListener('click', () => {
    if (drawer.inert) return void showList()
    drawer.inert = true
    toggle.setAttribute('aria-expanded', 'false')
  })
  // A new recording makes any message stale.
  root.querySelector('[data-loop="record"]')!.addEventListener('click', () => say(''))

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const name = nameInput.value.trim()
    const jam = { id: '', name, pattern: looper.pattern(), kit: kit.kit(), bpm: looper.bpm(), created_at: Date.now() }
    const item = row(jam)
    pending.add(item)
    list.prepend(item)
    nameInput.value = ''
    submit.disabled = true
    showForm(false)
    if (drawer.inert) void showList()
    api<{ id: string }>({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, pattern: jam.pattern, kit: jam.kit, bpm: jam.bpm }),
    })
      // Keep it on the wall when the list is next shown, even if that list was fetched before it landed.
      .then(({ id }) => void (latest = [{ ...jam, id }, ...(latest ?? [])]))
      .catch((error: Error) => {
        // Refused (or failed): take it back off, and keep the name to fix.
        item.animate([{ opacity: 1 }, { opacity: 0 }], 200).finished.then(() => item.remove())
        nameInput.value = name
        submit.disabled = false
        say(`“${name}” wasn’t posted. ${error.message}`, true)
      })
      .finally(() => pending.delete(item))
  })

  void load()
  refresh()
  return { refresh }
}
