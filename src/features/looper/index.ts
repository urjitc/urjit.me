import type { DrumKit } from '../drum-kit'
import { audioTime, playTick } from '../drum-kit/synth'
import { beatSeconds, BEATS, BPM, encodeHits, loopSeconds, type Hit } from './jam'
import { mountJamWall } from './wall'

/** How far ahead (s) hits go on the audio clock, and how often (ms) that's topped up. */
const LOOKAHEAD = 0.1
const SCHEDULE_MS = 25
/** Beats of clicks before recording starts. */
const COUNT_IN = 4

/** A recorded hit, and when (seconds from the loop's start) it was played live, so it first
    repeats on the next time round rather than doubling what was just heard. */
type Take = Hit & { played: number }

/**
 * Where the looper is; each mode shows only the buttons that mean something in it, and
 * within a loop, ones that can't be used just now dim rather than fold, so the row holds.
 *
 *   browsing    nothing recorded              Record · Jams
 *   listening   a jam from the wall plays     Record · Jams (the list open)
 *   recording   a take, after a bar's count-in unless your loop was playing
 *                 the first                   Done · tempo, which Undo replaces at the first hit
 *                 a layer                     Done · Stop · Undo · Post (dim)
 *   playing     your loop                     Record · Stop · Undo · Post
 *   stopped     your loop, silent             Record · Play · Undo · Post
 *   naming      the name field for posting, over whatever was playing
 */
type Mode = 'browsing' | 'listening' | 'recording' | 'playing' | 'stopped' | 'naming'

/**
 * A two-bar loop over the kit, and the public jam wall under it (wall.ts).
 *
 * Record counts in a bar of clicks, lighting the last bar's dots as if leading round into
 * the first; then whatever's played loops at the exact times it was played, a click keeping
 * time and a dot per beat showing where the loop is. Done ends the take and the loop plays
 * on (Stop ends it silent); Record again adds a layer. Undo during a take clears just that
 * take while the clicks carry on, so a fluffed take is simply played again; otherwise it
 * takes off the newest layer, and with none left it's back to browsing. While the first
 * take has no hits, − and + set the tempo, the clicks following at once; the tempo then
 * holds for the loop, and for the next one. Post names the loop and hands it to the wall, back to browsing with it on
 * top; if its name's refused, it comes back to rename. Jams opens the wall's list, where
 * tapping a jam plays it at its tempo, and tapping it again (or closing the list) stops it.
 *
 * A hit is kept at the audio-clock time its sound played, and the loop replays it at that
 * time, so it comes back exactly as it was heard: the speakers' delay is the same both
 * times, so it needs no correcting. Playback is scheduled a little ahead on the audio clock
 * (web.dev/articles/audio-scheduling), which timers alone can't keep steady.
 */
export function mountLooper(root: HTMLElement, kit: DrumKit): void {
  const buttons = root.querySelector<HTMLElement>('.loop-buttons')!
  const record = root.querySelector<HTMLButtonElement>('[data-loop="record"]')!
  const playButton = root.querySelector<HTMLButtonElement>('[data-loop="play"]')!
  const undo = root.querySelector<HTMLButtonElement>('[data-loop="undo"]')!
  const postButton = root.querySelector<HTMLButtonElement>('[data-wall="post"]')!
  const jamsButton = root.querySelector<HTMLButtonElement>('[data-wall="toggle"]')!
  const tempo = root.querySelector<HTMLElement>('.loop-tempo')!
  const slower = tempo.querySelector<HTMLButtonElement>('[data-loop="slower"]')!
  const faster = tempo.querySelector<HTMLButtonElement>('[data-loop="faster"]')!
  const bpmLabel = tempo.querySelector<HTMLElement>('.bpm')!
  const form = root.querySelector<HTMLFormElement>('.post-form')!
  const nameInput = form.querySelector('input')!
  const submit = form.querySelector<HTMLButtonElement>('[type="submit"]')!
  const dots = Array.from({ length: BEATS }, () => document.createElement('i'))
  root.querySelector('.loop-beats')!.append(...dots)
  const wall = mountJamWall(root, kit, { listen, stop: () => browse() })

  let mode: Mode = 'browsing'
  let layers: Take[][] = []
  /** The wall's jam while listening. */
  let jam: Take[] = []
  /** Your loop's tempo; and the clock's beat and loop lengths (s), a wall jam's while one plays. */
  let bpm: number = BPM.default
  let beat = beatSeconds(bpm)
  let loop = loopSeconds(bpm)
  /** Audio time of the loop's first beat. */
  let start = 0
  /** Everything before this (seconds from start) is scheduled; and the next beat to be. */
  let scheduled = 0
  let nextBeat = 0
  /** Set while the clock runs. */
  let timer: number | undefined
  const pending = new Set<number>()

  const takes = () => (mode === 'listening' ? jam : layers.flat())

  /** Moves to `next` and shows its buttons. Those not needed are `inert`: looper.css folds
      them away smoothly. */
  function go(next: Mode): void {
    mode = next
    const take = layers.at(-1) ?? []
    const looped = mode === 'playing' || mode === 'stopped'
    const browsing = mode === 'browsing' || mode === 'listening'
    const firstTake = mode === 'recording' && layers.length === 1
    const layering = mode === 'recording' && !firstTake
    buttons.inert = mode === 'naming'
    form.inert = mode !== 'naming'
    record.setAttribute('aria-pressed', String(mode === 'recording'))
    record.querySelector('.label')!.textContent = mode === 'recording' ? 'Done' : 'Record'
    tempo.inert = !firstTake || take.length > 0
    bpmLabel.textContent = String(bpm)
    slower.disabled = bpm <= BPM.min
    faster.disabled = bpm >= BPM.max
    playButton.inert = !looped && !layering
    playButton.querySelector('.label')!.textContent = mode === 'stopped' ? 'Play' : 'Stop'
    undo.inert = firstTake ? !take.length : !looped && !layering
    undo.disabled = mode === 'recording' && !take.length
    postButton.inert = !looped && !layering
    postButton.disabled = layering
    jamsButton.inert = !browsing
    if (!browsing) wall.close()
    if (mode !== 'listening') wall.unmark()
    root.dataset.playing = String(timer !== undefined)
    if (mode === 'naming') nameInput.focus()
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
      recording, and, as it plays, the beat's dot lit (the count-in lights the last bar's). */
  function tick(index: number): void {
    const at = start + index * beat
    if (mode === 'recording') playTick(index % 4 === 0, at)
    const timeout = setTimeout(() => {
      pending.delete(timeout)
      dots.forEach((dot, i) => dot.classList.toggle('lit', i === (index + BEATS) % BEATS))
    }, (at - audioTime()) * 1000)
    pending.add(timeout)
  }

  /** Starts the clock at `clockBpm`, `lead` seconds ahead of the loop's first beat. */
  function startClock(lead: number, clockBpm: number): void {
    beat = beatSeconds(clockBpm)
    loop = loopSeconds(clockBpm)
    start = audioTime() + lead
    scheduled = -lead
    nextBeat = Math.ceil(-lead / beat)
    timer = setInterval(schedule, SCHEDULE_MS)
    schedule()
  }

  function stopClock(): void {
    clearInterval(timer)
    timer = undefined
    for (const timeout of pending) clearTimeout(timeout)
    pending.clear()
    for (const dot of dots) dot.classList.remove('lit')
    // Played live in a run that's over: from the next run, every hit plays from the first time round.
    for (const take of layers.flat()) take.played = -1
  }

  /** Stops whatever plays and goes back to browsing. */
  function browse(): void {
    stopClock()
    go('browsing')
  }

  function listen(hits: Hit[], jamBpm: number): void {
    stopClock()
    jam = hits.map((hit) => ({ ...hit, played: -1 }))
    startClock(0.05, jamBpm)
    go('listening')
  }

  /** Ends the take: the loop plays on, or with nothing recorded, it's back to browsing. */
  function done(): void {
    if (!layers.at(-1)?.length) layers.pop()
    if (layers.length) go('playing')
    else browse()
  }

  /** Sets the tempo while the first take's clicks play: they carry on from the last one
      scheduled, at the new spacing. */
  function setTempo(next: number): void {
    const last = nextBeat - 1
    const at = start + last * beat
    bpm = next
    beat = beatSeconds(bpm)
    loop = loopSeconds(bpm)
    start = at - last * beat
    scheduled = last * beat
    go(mode)
  }

  kit.onPlay((sound, time = audioTime()) => {
    if (mode !== 'recording') return
    const played = time - start
    const at = ((played % loop) + loop) % loop
    layers.at(-1)!.push({ at, sound, played })
    go(mode)
  })

  record.addEventListener('click', () => {
    if (mode === 'recording') return done()
    wall.say('')
    const wasPlaying = mode === 'playing'
    if (mode === 'listening') stopClock()
    layers.push([])
    // Over a loop that's playing, record straight in; otherwise count in a bar first.
    if (!wasPlaying) startClock(0.1 + COUNT_IN * beatSeconds(bpm), bpm)
    go('recording')
  })

  // Play or Stop; Stop during a layer ends the take too.
  playButton.addEventListener('click', () => {
    if (mode === 'stopped') {
      startClock(0.05, bpm)
      return go('playing')
    }
    if (!layers.at(-1)?.length) layers.pop()
    stopClock()
    go('stopped')
  })

  // During a take, clears just that take (the clicks carry on); otherwise the newest layer.
  undo.addEventListener('click', () => {
    if (mode === 'recording') layers.at(-1)!.length = 0
    else layers.pop()
    if (layers.length) go(mode)
    else browse()
  })

  slower.addEventListener('click', () => setTempo(bpm - BPM.step))
  faster.addEventListener('click', () => setTempo(bpm + BPM.step))
  jamsButton.addEventListener('click', () => {
    if (!wall.isOpen()) return wall.open()
    wall.close()
    if (mode === 'listening') browse()
  })

  postButton.addEventListener('click', () => go('naming'))
  const cancel = () => go(timer === undefined ? 'stopped' : 'playing')
  form.querySelector('[data-wall="cancel"]')!.addEventListener('click', cancel)
  form.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') cancel()
  })
  // Post stays off until there's a name (spaces alone don't count).
  nameInput.addEventListener('input', () => (submit.disabled = !nameInput.value.trim()))

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const name = nameInput.value.trim()
    const kept = layers
    nameInput.value = ''
    submit.disabled = true
    layers = []
    browse()
    wall.post({ name, pattern: encodeHits(kept.flat()), kit: kit.kit(), bpm }).catch(() => {
      // Refused (the wall says why): bring the loop back to rename, unless a new one's begun.
      if (layers.length) return
      stopClock()
      layers = kept
      nameInput.value = name
      submit.disabled = false
      go('naming')
    })
  })

  // Hidden tabs slow timers to a crawl, so the loop would stutter: stop it instead.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden || timer === undefined) return
    stopClock()
    if (mode === 'recording' && !layers.at(-1)?.length) layers.pop()
    if (mode === 'naming') go(mode)
    else go(layers.length ? 'stopped' : 'browsing')
  })

  go(mode)
}
