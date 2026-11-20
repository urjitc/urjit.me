import type { DrumKit } from '../drum-kit'
import { decodeHits, KITS, type Hit } from './jam'

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

/** The wall as the looper drives it (index.ts). */
export interface JamWall {
  open(): void
  close(): void
  isOpen(): boolean
  /** Unmarks the jam that was playing. */
  unmark(): void
  /** Shows a message on the looper's info line; a passing one clears itself. */
  say(message: string, passing?: boolean): void
  /** Puts a jam on the wall, at once at the top of the list while the server checks its
      name; if it's refused, the row goes again, the reason's said, and the promise rejects. */
  post(jam: Pick<Jam, 'name' | 'pattern' | 'kit' | 'bpm'>): Promise<void>
}

/**
 * The public jam wall's list, folding open under the looper. Tapping a jam plays it on the
 * kit right above (`listen`); tapping it again stops it (`stop`). The list is fetched as
 * the page loads, so it opens at once; each open fetches it afresh for the next. Posting is
 * optimistic, since the name check can take seconds (worker/jams.ts); nobody else sees a jam
 * until it passes.
 */
export function mountJamWall(
  root: HTMLElement,
  kit: DrumKit,
  player: { listen(hits: Hit[], bpm: number): void; stop(): void },
): JamWall {
  const toggle = root.querySelector<HTMLButtonElement>('[data-wall="toggle"]')!
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

  function say(message: string, passing = false): void {
    clearTimeout(noteTimer)
    status.textContent = message
    if (passing) noteTimer = setTimeout(() => (status.textContent = ''), NOTE_MS)
  }

  async function open(): Promise<void> {
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

  function close(): void {
    drawer.inert = true
    toggle.setAttribute('aria-expanded', 'false')
  }

  function unmark(): void {
    for (const button of list.querySelectorAll('[aria-pressed="true"]')) button.setAttribute('aria-pressed', 'false')
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
      if (button.getAttribute('aria-pressed') === 'true') return player.stop()
      const hits = decodeHits(jam.pattern, jam.bpm)
      if (!hits) return
      const known = KITS.find((name) => name === jam.kit)
      if (known) kit.setKit(known)
      player.listen(hits, jam.bpm)
      unmark()
      button.setAttribute('aria-pressed', 'true')
    })
    const item = document.createElement('li')
    item.append(button)
    return item
  }

  function post(posted: Pick<Jam, 'name' | 'pattern' | 'kit' | 'bpm'>): Promise<void> {
    const jam = { ...posted, id: '', created_at: Date.now() }
    const item = row(jam)
    pending.add(item)
    if (drawer.inert) void open()
    else list.prepend(item)
    return api<{ id: string }>({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(posted) })
      // Keep it on the wall when the list is next shown, even if that list was fetched before it landed.
      .then(
        ({ id }) => void (latest = [{ ...jam, id }, ...(latest ?? [])]),
        (error: Error) => {
          item.animate([{ opacity: 1 }, { opacity: 0 }], 200).finished.then(() => item.remove())
          say(`“${jam.name}” wasn’t posted. ${error.message}`, true)
          throw error
        },
      )
      .finally(() => pending.delete(item))
  }

  void load()
  return { open: () => void open(), close, isOpen: () => !drawer.inert, unmark, say, post }
}
