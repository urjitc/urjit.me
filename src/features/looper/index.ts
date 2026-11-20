import type { DrumKit } from '../drum-kit'
import { audioTime, playTick } from '../drum-kit/synth'
import { beatSeconds, BEATS, BPM, encodeHits, loopSeconds, type Hit } from './jam'

/** How far ahead (s) hits go on the audio clock, and how often (ms) that's topped up. */
const LOOKAHEAD = 0.1
const SCHEDULE_MS = 25
/** Beats of clicks before recording starts. */
const COUNT_IN = 4

/** A recorded hit, and when (seconds from the loop's start) it was played live, so it first
    repeats on the next time round rather than doubling what was just heard. */
type Take = Hit & { played: number }

export interface Looper {
  /** Plays someone's jam from the wall at its tempo, leaving your own loop as it is. */
  listen(hits: Hit[], bpm: number): void
  stop(): void
  /** Your loop's hits in jam pattern form, or '' when nothing's recorded. */
  pattern(): string
  /** Your loop's tempo. */
  bpm(): number
}

/**
 * A two-bar loop over the kit. Press Record: a bar of clicks counts in, then whatever's
 * played loops at the exact times it was played, while a click keeps time and a dot per
 * beat shows where the loop is. Recording again adds a layer; Undo takes the last one off.
 * A jam from the wall plays through the same clock, at its own tempo, in place of your loop
 * until it stops. Before the first take, − and + on the info line set the tempo; from then
 * it's fixed until every layer's undone.
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
  const tempo = root.querySelector<HTMLElement>('.loop-tempo')!
  const slower = tempo.querySelector<HTMLButtonElement>('[data-loop="slower"]')!
  const faster = tempo.querySelector<HTMLButtonElement>('[data-loop="faster"]')!
  const bpmLabel = tempo.querySelector<HTMLElement>('.bpm')!
  const dots = Array.from({ length: BEATS }, () => document.createElement('i'))
  root.querySelector('.loop-beats')!.append(...dots)

  let layers: Take[][] = []
  /** A jam from the wall that's playing instead of your loop. */
  let listening: Take[] | null = null
  let recording = false
  let playing = false
  /** Your loop's tempo; and the clock's beat and loop lengths (s), a wall jam's while one plays. */
  let bpm: number = BPM.default
  let beat = beatSeconds(bpm)
  let loop = loopSeconds(bpm)
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
    tempo.inert = playing
    bpmLabel.textContent = String(bpm)
    slower.disabled = hasLoop || bpm <= BPM.min
    faster.disabled = hasLoop || bpm >= BPM.max
    onChange()
  }

  function schedule(): void {
    const until = audioTime() + LOOKAHEAD - start
    for (; nextBeat * beat < until; nextBeat++) tick(nextBeat)
    for (let pass = Math.floor(Math.max(scheduled, 0) / loop); pass * loop < until; pass++) {
      for (const take of takes()) {
        const at = pass * loop + take.at
        if (at >= scheduled && at < until && at > take.played) kit.playAt(take.sound, start + at)
      }
    }
    scheduled = until
  }

  /** Beat `index` from the loop's start (negative while counting in): a click while
      recording, and, as it plays, the count-in number or the beat's dot lit. */
  function tick(index: number): void {
    const at = start + index * beat
    if (recording) playTick(index % 4 === 0, at)
    const timeout = setTimeout(() => {
      pending.delete(timeout)
      count.textContent = index < 0 ? String(-index) : ''
      dots.forEach((dot, i) => dot.classList.toggle('lit', i === index % BEATS))
    }, (at - audioTime()) * 1000)
    pending.add(timeout)
  }

  /** Starts the loop's clock at `clockBpm`, `lead` seconds ahead of its first beat. */
  function run(lead: number, clockBpm = bpm): void {
    beat = beatSeconds(clockBpm)
    loop = loopSeconds(clockBpm)
    start = audioTime() + lead
    scheduled = -lead
    nextBeat = Math.ceil(-lead / beat)
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
    // Played live in a run that's over: from the next run, every hit plays from the first time round.
    for (const take of mine()) take.played = -1
    render()
  }

  function listen(hits: Hit[], jamBpm: number): void {
    stop()
    listening = hits.map((hit) => ({ ...hit, played: -1 }))
    run(0.05, jamBpm)
  }

  kit.onPlay((sound, time = audioTime()) => {
    if (!recording) return
    const played = time - start
    const at = ((played % loop) + loop) % loop
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
    else run(0.1 + COUNT_IN * beatSeconds(bpm))
  })

  playButton.addEventListener('click', () => (playing ? stop() : run(0.05)))
  slower.addEventListener('click', () => ((bpm -= BPM.step), render()))
  faster.addEventListener('click', () => ((bpm += BPM.step), render()))

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
  return { listen, stop, pattern: () => encodeHits(mine()), bpm: () => bpm }
}
