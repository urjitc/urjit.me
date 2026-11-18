/**
 * Drum kits. Rock plays recorded samples; Trap and 8-bit are synthesised from
 * oscillators and noise. Only 8-bit is bitcrushed, so the other two stay clean.
 * Everything runs through a shared room reverb and a gentle compressor for body.
 *
 * Recipes follow Sound On Sound's "Synth Secrets" drum articles and the TR-808 design:
 * a real drum's pitch bends only a couple of semitones, and a big slow pitch sweep is
 * what makes a synth drum sound like a laser.
 */

const NOISE_SECONDS = 2
const REVERB_SECONDS = 1.6
const HAT_FREQS = [205.3, 304.4, 369.6, 522.7, 540, 800] // the TR-808's six cymbal squares

export const KITS = ['rock', 'trap', '8bit'] as const
export type Kit = (typeof KITS)[number]

type Voice = (play: Play, at: number) => void

/** Where one hit renders: the shared context, this kit's output stage, and its noise. */
type Play = {
  audio: AudioContext
  out: AudioNode
  noise: AudioBuffer
}

function envelope(play: Play, at: number, peak: number, seconds: number): GainNode {
  const gain = play.audio.createGain()
  gain.gain.setValueAtTime(peak, at)
  gain.gain.exponentialRampToValueAtTime(0.001, at + seconds)
  gain.connect(play.out)
  return gain
}

/** A tone that bends from `from` to `to` Hz over `glide` seconds, then holds. */
function tone(
  play: Play,
  at: number,
  type: OscillatorType,
  from: number,
  to: number,
  glide: number,
  seconds: number,
  peak: number,
): void {
  const osc = play.audio.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(from, at)
  osc.frequency.exponentialRampToValueAtTime(to, at + glide)
  osc.connect(envelope(play, at, peak, seconds))
  osc.start(at)
  osc.stop(at + seconds)
}

/** A burst of filtered noise: snare wires, beater click, cymbal wash. */
function noise(
  play: Play,
  at: number,
  type: BiquadFilterType,
  cutoff: number,
  seconds: number,
  peak: number,
): void {
  const source = play.audio.createBufferSource()
  source.buffer = play.noise
  const filter = play.audio.createBiquadFilter()
  filter.type = type
  filter.frequency.value = cutoff
  source.connect(filter).connect(envelope(play, at, peak, seconds))
  source.start(at, Math.random() * (NOISE_SECONDS - seconds))
  source.stop(at + seconds)
}

/** The 808's metal: six squares through a band-pass and a high-pass. Hats and cymbals. */
function metal(play: Play, at: number, band: number, seconds: number, peak: number): void {
  const bandpass = play.audio.createBiquadFilter()
  bandpass.type = 'bandpass'
  bandpass.frequency.value = band
  const highpass = play.audio.createBiquadFilter()
  highpass.type = 'highpass'
  highpass.frequency.value = 7000
  bandpass.connect(highpass).connect(envelope(play, at, peak, seconds))
  for (const freq of HAT_FREQS) {
    const osc = play.audio.createOscillator()
    osc.type = 'square'
    osc.frequency.value = freq
    osc.connect(bandpass)
    osc.start(at)
    osc.stop(at + seconds)
  }
}

/** An 808 tom: a sine that settles about 2 semitones down, with a soft attack click. */
function tom808(play: Play, at: number, pitch: number, seconds: number): void {
  tone(play, at, 'sine', pitch * 1.12, pitch, seconds * 0.5, seconds, 0.9)
  noise(play, at, 'lowpass', 2500, 0.01, 0.2)
}

/** A clap: three quick noise slaps, then a short tail, like several hands landing. */
function clap(play: Play, at: number): void {
  for (const offset of [0, 0.011, 0.022]) noise(play, at + offset, 'bandpass', 1500, 0.02, 0.5)
  noise(play, at + 0.03, 'bandpass', 1300, 0.15, 0.35)
}

/**
 * Per-drum level trims in dB, measured off the site's output (loudness over 400 ms, roughly
 * K-weighted) and set against the snare: kick +2 (Trap's 808 untrimmed: the meter undervalues its
 * sub-bass, and trimmed it sounded far too quiet), bell -1, open hat -2,
 * closed hat -6. The crash/ride sits under the snare (6 dB on Rock, 3 on the synths):
 * level with it on the meter, it was too loud by ear. Toms keep their recorded level (6-9 dB over the
 * snare on the meter): trimmed to match, they sounded too quiet by ear.
 */
type Levels = Partial<Record<string, number>>

type SynthKit = {
  kind: 'synth'
  levels: Levels
  /** How much of the kit goes to the room reverb. */
  reverb: number
  /** Soft-clip drive: a little warmth at 1, real dirt at 3. */
  drive: number
  /** Amplitude steps each side of zero (8 is 4-bit). Omit for no bitcrush. */
  steps?: number
  /** Hold each noise sample this many times: 2+ gives the grainy console hiss. */
  noiseHold: number
  voices: Record<string, Voice>
}

type SampleKit = {
  kind: 'samples'
  levels: Levels
  reverb: number
  urls: Record<string, string>
}

const sampleUrls = import.meta.glob<string>('./samples/*/*.mp3', {
  eager: true,
  query: '?url',
  import: 'default',
})

/** A sample kit's files by drum name, from samples/<kit>/<drum>.mp3. */
function samplesFor(kit: Kit): Record<string, string> {
  const folder = `./samples/${kit}/`
  return Object.fromEntries(
    Object.entries(sampleUrls)
      .filter(([path]) => path.startsWith(folder))
      .map(([path, url]) => [path.slice(folder.length, -4), url]),
  )
}

const SPECS: Record<Kit, SynthKit | SampleKit> = {
  rock: {
    kind: 'samples',
    reverb: 0.22,
    urls: samplesFor('rock'),
    levels: { kick: 7, hihat: 7.5, 'hihat-open': 1.5, ride: -4.5, bell: -0.5 },
  },
  trap: {
    kind: 'synth',
    levels: { hihat: 2.5, 'hihat-open': -1, ride: -5.5, bell: -4 },
    reverb: 0.18,
    drive: 1.4,
    noiseHold: 1,
    voices: {
      // 808 boom: a sine with a quick pitch blip, then a long tail.
      kick: (p, t) => {
        tone(p, t, 'sine', 110, 52, 0.06, 1.1, 1)
        noise(p, t, 'lowpass', 3000, 0.006, 0.35)
      },
      // 808 snare body (two tones) layered with a clap, as trap usually does.
      snare: (p, t) => {
        tone(p, t, 'sine', 238, 238, 0.01, 0.12, 0.45)
        tone(p, t, 'sine', 476, 476, 0.01, 0.07, 0.25)
        noise(p, t, 'highpass', 2000, 0.16, 0.35)
        clap(p, t)
      },
      'tom-left': (p, t) => tom808(p, t, 165, 0.45),
      'tom-right': (p, t) => tom808(p, t, 125, 0.55),
      'floor-tom': (p, t) => tom808(p, t, 88, 0.7),
      hihat: (p, t) => metal(p, t, 10000, 0.05, 0.6),
      'hihat-open': (p, t) => metal(p, t, 10000, 0.42, 0.5),
      // A ride bell: two inharmonic partials ringing over a short metal tick.
      bell: (p, t) => {
        tone(p, t, 'triangle', 830, 830, 0.01, 1.1, 0.3)
        tone(p, t, 'sine', 1245, 1245, 0.01, 0.7, 0.18)
        metal(p, t, 9000, 0.08, 0.2)
      },
      // Crash/ride hybrid: long 808 metal over a noise wash.
      ride: (p, t) => {
        metal(p, t, 8000, 1.2, 0.35)
        noise(p, t, 'highpass', 6000, 1.0, 0.12)
      },
    },
  },
  '8bit': {
    kind: 'synth',
    levels: { kick: 0.5, hihat: 4.5, 'hihat-open': 1, ride: -4, bell: -1 },
    reverb: 0.08,
    drive: 1.2,
    steps: 8,
    noiseHold: 3,
    voices: {
      kick: (p, t) => tone(p, t, 'square', 160, 45, 0.06, 0.18, 0.55),
      snare: (p, t) => {
        noise(p, t, 'highpass', 1000, 0.16, 0.5)
        tone(p, t, 'square', 240, 150, 0.04, 0.06, 0.3)
      },
      'tom-left': (p, t) => tone(p, t, 'square', 330, 220, 0.05, 0.2, 0.4),
      'tom-right': (p, t) => tone(p, t, 'square', 250, 165, 0.05, 0.22, 0.4),
      'floor-tom': (p, t) => tone(p, t, 'square', 170, 110, 0.05, 0.28, 0.45),
      hihat: (p, t) => noise(p, t, 'highpass', 7000, 0.04, 0.4),
      'hihat-open': (p, t) => noise(p, t, 'highpass', 7000, 0.32, 0.32),
      ride: (p, t) => noise(p, t, 'highpass', 3000, 0.7, 0.25),
      bell: (p, t) => {
        tone(p, t, 'square', 1047, 1047, 0.01, 0.4, 0.22)
        tone(p, t, 'square', 1568, 1568, 0.01, 0.25, 0.1)
      },
    },
  },
}

function makeNoise(audio: BaseAudioContext, seconds: number, hold = 1): AudioBuffer {
  const buffer = audio.createBuffer(1, audio.sampleRate * seconds, audio.sampleRate)
  const data = buffer.getChannelData(0)
  let value = 0
  for (let i = 0; i < data.length; i++) {
    if (i % hold === 0) value = Math.random() * 2 - 1
    data[i] = value
  }
  return buffer
}

/** A room impulse response: stereo noise with an exponential decay. */
function makeRoom(audio: AudioContext): AudioBuffer {
  const length = audio.sampleRate * REVERB_SECONDS
  const buffer = audio.createBuffer(2, length, audio.sampleRate)
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel)
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3
  }
  return buffer
}

/** Soft-clip by `drive`, then (only if `steps` is set) quantise for 8-bit grit. */
function shaper(audio: AudioContext, drive: number, steps?: number): WaveShaperNode {
  const curve = new Float32Array(1024)
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1
    const clipped = Math.tanh(drive * x) / Math.tanh(drive)
    curve[i] = steps ? Math.round(clipped * steps) / steps : clipped
  }
  const node = audio.createWaveShaper()
  node.curve = curve
  return node
}

const sampleBuffers = new Map<string, AudioBuffer>()
const loadedKits = new Set<Kit>()
let decoder: OfflineAudioContext | undefined

/**
 * Fetches and decodes a sample kit's files, once; synth kits need nothing. Decoding needs no
 * user gesture, so callers load the kit in play ahead of its first hit (after the page has
 * loaded, and when the kit or sound changes) rather than every kit up front.
 * AudioBuffers work in any context.
 */
export function loadSamples(kit: Kit): void {
  const spec = SPECS[kit]
  if (spec.kind !== 'samples' || loadedKits.has(kit)) return
  loadedKits.add(kit)
  decoder ??= new OfflineAudioContext(1, 1, 44100)
  const context = decoder
  for (const [name, url] of Object.entries(spec.urls)) {
    void fetch(url)
      .then((response) => response.arrayBuffer())
      .then((data) => context.decodeAudioData(data))
      .then((buffer) => sampleBuffers.set(`${kit}/${name}`, buffer))
  }
}

type Output = { audio: AudioContext; bus: AudioNode; room: AudioNode }
let output: Output | null = null
const plays: Partial<Record<Kit, Play>> = {}
const sends: Partial<Record<Kit, AudioNode>> = {}

/** The shared chain: kit → bus → compressor → speakers, with a reverb send beside it. */
function getOutput(): Output {
  if (output) return output
  // iOS treats Web Audio as "ambient" sound, so the silent switch mutes it. Declaring the
  // page a playback app makes the drums audible like music. Other browsers ignore this.
  if (navigator.audioSession) navigator.audioSession.type = 'playback'
  const audio = new AudioContext()
  const compressor = audio.createDynamicsCompressor()
  compressor.threshold.value = -18
  compressor.ratio.value = 3
  compressor.attack.value = 0.01
  compressor.release.value = 0.2
  const bus = audio.createGain()
  bus.gain.value = 0.7
  const room = audio.createConvolver()
  room.buffer = makeRoom(audio)
  bus.connect(compressor)
  room.connect(compressor)
  compressor.connect(audio.destination)
  return (output = { audio, bus, room })
}

/** Where a kit's sound enters: straight to the bus, plus its share sent to the room. */
function kitInput(kit: Kit): AudioNode {
  const existing = sends[kit]
  if (existing) return existing
  const { audio, bus, room } = getOutput()
  const input = audio.createGain()
  const send = audio.createGain()
  send.gain.value = SPECS[kit].reverb
  input.connect(bus)
  input.connect(send).connect(room)
  return (sends[kit] = input)
}

/** The output stage for a synth kit, built on first use. */
function playFor(kit: Kit, spec: SynthKit): Play {
  const existing = plays[kit]
  if (existing) return existing
  const { audio } = getOutput()
  const out = shaper(audio, spec.drive, spec.steps)
  out.connect(kitInput(kit))
  return (plays[kit] = { audio, out, noise: makeNoise(audio, NOISE_SECONDS, spec.noiseHold) })
}

/** Plays a drum on a kit. Call from a user gesture: the first call creates the audio context. */
/** A gain stage for one hit, at the drum's level trim, feeding `into`. */
function trimmed(audio: AudioContext, into: AudioNode, levels: Levels, name: string): GainNode {
  const trim = audio.createGain()
  trim.gain.value = 10 ** ((levels[name] ?? 0) / 20)
  trim.connect(into)
  return trim
}

export function playDrum(kit: Kit, name: string): void {
  const spec = SPECS[kit]
  if (spec.kind === 'samples') {
    const buffer = sampleBuffers.get(`${kit}/${name}`)
    if (!buffer) return
    const input = kitInput(kit)
    const { audio } = getOutput()
    void audio.resume()
    const source = audio.createBufferSource()
    source.buffer = buffer
    source.connect(trimmed(audio, input, spec.levels, name))
    source.start()
    return
  }
  const voice = spec.voices[name]
  if (!voice) return
  const play = playFor(kit, spec)
  void play.audio.resume()
  voice({ ...play, out: trimmed(play.audio, play.out, spec.levels, name) }, play.audio.currentTime)
}
