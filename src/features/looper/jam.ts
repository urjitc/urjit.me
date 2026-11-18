/**
 * A jam: a two-bar drum loop, shared by the page (src/features/looper) and the Worker
 * (worker/jams.ts) so both agree on what a valid one is.
 *
 * Hits keep the exact time they were played, to the millisecond. A jam is sent and stored
 * as a pattern string, four characters a hit: its time into the loop in ms, in base 36
 * (three characters), then its sound's index in SOUNDS.
 */
export const BEAT_SECONDS = 0.6 // 100 BPM
export const BEATS = 8 // two bars of four
export const LOOP_SECONDS = BEAT_SECONDS * BEATS

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

export function encodeHits(hits: Hit[]): string {
  return hits
    .map(({ at, sound }) => Math.round(at * 1000).toString(36).padStart(3, '0') + SOUNDS.indexOf(sound))
    .join('')
}

/** The hits in a pattern string, or null if it isn't a valid one. */
export function decodeHits(pattern: string): Hit[] | null {
  if (!PATTERN.test(pattern) || pattern.length > MAX_HITS * 4) return null
  const hits = (pattern.match(/.{4}/g) ?? []).map((hit) => ({
    at: parseInt(hit.slice(0, 3), 36) / 1000,
    sound: SOUNDS[Number(hit[3])] ?? 'kick',
  }))
  return hits.every(({ at }) => at < LOOP_SECONDS) ? hits : null
}
