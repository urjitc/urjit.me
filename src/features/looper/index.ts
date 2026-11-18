import type { DrumKit } from '../drum-kit'
import { audioTime, playTick } from '../drum-kit/synth'
import { BEAT_SECONDS, BEATS, encodeHits, LOOP_SECONDS, type Hit } from './jam'

/** How far ahead (s) hits go on the audio clock, and how often (ms) that's topped up. */
const LOOKAHEAD = 0.1
const SCHEDULE_MS = 25
/** Beats of clicks before recording starts. */
const COUNT_IN = 4

/** A recorded hit, and when (seconds from the loop's start) it was played live, so it first
    repeats on the next time round rather than doubling what was just heard. */
type Take = Hit & { played: number }

export interface Looper {
  /** Plays someone's jam from the wall, leaving your own loop as it is. */
  listen(hits: Hit[]): void
  stop(): void
  /** Your loop's hits in jam pattern form, or '' when nothing's recorded. */
  pattern(): string
}

/**
 * A two-bar loop over the kit. Press Record: a bar of clicks counts in, then whatever's
 * played loops at the exact times it was played, while a click keeps time and a dot per
 * beat shows where the loop is. Recording again adds a layer; Undo takes the last one off.
 * A jam from the wall plays through the same clock, in place of your loop until it stops.
 *
 * A hit is kept at the audio-clock time its sound played, and the loop replays it at that
 * time, so it comes back exactly as it was heard: the speakers' delay is the same both
 * times, so it needs no correcting. Playback is scheduled a little ahead on the audio clock
 * (web.dev/articles/audio-scheduling), which timers alone can't keep steady.
 */
export function mountLooper(root: HTMLElement, kit: DrumKit, onChange: () => void): Looper {
  const record = root.querySelector<HTMLButtonElement>('[data-loop="record"]')!
  const playButton = root.querySelector<HTMLButtonElement>('[data-loop="play"]')!
  const undo = root.querySelector<HTMLButtonElement>('[data-loop="undo"]')!
  const count = root.querySelector<HTMLElement>('.loop-count')!
  const dots = Array.from({ length: BEATS }, () => document.createElement('i'))
  root.querySelector('.loop-beats')!.append(...dots)

  let layers: Take[][] = []
  /** A jam from the wall that's playing instead of your loop. */
  let listening: Take[] | null = null
  let recording = false
  let playing = false
  /** Audio time of the loop's first beat. */
  let start = 0
  /** Everything before this (seconds from start) is scheduled; and the next beat to be. */
  let scheduled = 0
  let nextBeat = 0
  let timer: number | undefined
  const pending = new Set<number>()

  const mine = () => layers.flat()
  const takes = () => listening ?? mine()

  // Buttons that aren't needed yet are `inert`: looper.css folds them away smoothly.
  function render(): void {
    const hasLoop = mine().length > 0
    record.setAttribute('aria-pressed', String(recording))
    playButton.inert = !hasLoop && !playing
    playButton.querySelector('.label')!.textContent = playing ? 'Stop' : 'Play'
    undo.inert = !hasLoop || listening !== null
    root.dataset.playing = String(playing)
    root.dataset.listening = String(listening !== null)
    onChange()
  }

  function schedule(): void {
    const until = audioTime() + LOOKAHEAD - start
    for (; nextBeat * BEAT_SECONDS < until; nextBeat++) beat(nextBeat)
    for (let pass = Math.floor(Math.max(scheduled, 0) / LOOP_SECONDS); pass * LOOP_SECONDS < until; pass++) {
      for (const take of takes()) {
        const at = pass * LOOP_SECONDS + take.at
        if (at >= scheduled && at < until && at > take.played) kit.playAt(take.sound, start + at)
      }
    }
    scheduled = until
  }

  /** Beat `index` from the loop's start (negative while counting in): a click while
      recording, and, as it plays, the count-in number or the beat's dot lit. */
  function beat(index: number): void {
    const at = start + index * BEAT_SECONDS
    if (recording) playTick(index % 4 === 0, at)
    const timeout = setTimeout(() => {
      pending.delete(timeout)
      count.textContent = index < 0 ? String(-index) : ''
      dots.forEach((dot, i) => dot.classList.toggle('lit', i === index % BEATS))
    }, (at - audioTime()) * 1000)
    pending.add(timeout)
  }

  /** Starts the loop's clock, `lead` seconds ahead of its first beat. */
  function run(lead: number): void {
    start = audioTime() + lead
    scheduled = -lead
    nextBeat = Math.ceil(-lead / BEAT_SECONDS)
    playing = true
    timer = setInterval(schedule, SCHEDULE_MS)
    schedule()
    render()
  }

  function stop(): void {
    clearInterval(timer)
    for (const timeout of pending) clearTimeout(timeout)
    pending.clear()
    for (const dot of dots) dot.classList.remove('lit')
    count.textContent = ''
    playing = false
    recording = false
    listening = null
    if (layers.at(-1)?.length === 0) layers.pop()
    render()
  }

  function listen(hits: Hit[]): void {
    stop()
    listening = hits.map((hit) => ({ ...hit, played: -1 }))
    run(0.05)
  }

  kit.onPlay((sound, time = audioTime()) => {
    if (!recording) return
    const played = time - start
    const at = ((played % LOOP_SECONDS) + LOOP_SECONDS) % LOOP_SECONDS
    layers.at(-1)?.push({ at, sound, played })
    render()
  })

  record.addEventListener('click', () => {
    if (recording) {
      recording = false
      if (layers.at(-1)?.length === 0) layers.pop()
      if (!mine().length) stop()
      render()
      return
    }
    if (listening) stop()
    recording = true
    layers.push([])
    // Over a loop that's playing, record straight in; otherwise count in a bar first.
    if (playing) render()
    else run(0.1 + COUNT_IN * BEAT_SECONDS)
  })

  playButton.addEventListener('click', () => (playing ? stop() : run(0.05)))

  undo.addEventListener('click', () => {
    // While recording, the first Undo clears this take; after that, earlier layers.
    if (recording && layers.at(-1)?.length) layers.at(-1)!.length = 0
    else layers.splice(recording ? -2 : -1, 1)
    if (!mine().length) stop()
    render()
  })

  // Hidden tabs slow timers to a crawl, so the loop would stutter: stop it instead.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && playing) stop()
  })

  render()
  return { listen, stop, pattern: () => encodeHits(mine()) }
}
