/**
 * A jam: a two-bar drum loop, shared by the page (src/features/looper) and the Worker
 * (worker/jams.ts) so both agree on what a valid one is.
 *
 * Hits keep the exact time they were played, to the millisecond. A jam is sent and stored
 * as a pattern string, four characters a hit: its time into the loop in ms, in base 36
 * (three characters), then its sound's index in SOUNDS. Its tempo is stored beside it, since
 * the loop's length depends on it.
 */
export const BEATS = 8 // two bars of four
/** Tempos a loop can be played at, in beats a minute; jams from before tempos were stored are 100. */
export const BPM = { min: 60, max: 180, step: 5, default: 100 } as const

export const beatSeconds = (bpm: number) => 60 / bpm
export const loopSeconds = (bpm: number) => beatSeconds(bpm) * BEATS

export function isBpm(bpm: unknown): bpm is number {
  return typeof bpm === 'number' && Number.isInteger(bpm) && bpm >= BPM.min && bpm <= BPM.max
}

export const SOUNDS = ['hihat', 'snare', 'kick', 'tom-left', 'tom-right', 'floor-tom', 'ride', 'bell'] as const
export type Sound = (typeof SOUNDS)[number]
export const KITS = ['rock', 'trap', '8bit'] as const

/** A hit `at` seconds into the loop. */
export type Hit = { at: number; sound: Sound }

export const NAME_MAX = 24
const MAX_HITS = 400
const PATTERN = /^(?:[0-9a-z]{3}[0-7])+$/

export function isSound(name: string | undefined): name is Sound {
  return SOUNDS.some((sound) => sound === name)
}

/** Rounds down to the ms, so a hit just before the loop's end stays inside it. */
export function encodeHits(hits: Hit[]): string {
  return hits
    .map(({ at, sound }) => Math.floor(at * 1000).toString(36).padStart(3, '0') + SOUNDS.indexOf(sound))
    .join('')
}

/** The hits in a pattern string, or null if it isn't a valid one at that tempo. */
export function decodeHits(pattern: string, bpm: number): Hit[] | null {
  if (!PATTERN.test(pattern) || pattern.length > MAX_HITS * 4) return null
  const hits = (pattern.match(/.{4}/g) ?? []).map((hit) => ({
    at: parseInt(hit.slice(0, 3), 36) / 1000,
    sound: SOUNDS[Number(hit[3])] ?? 'kick',
  }))
  return hits.every(({ at }) => at < loopSeconds(bpm)) ? hits : null
}
