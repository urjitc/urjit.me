export const FONT = 'Paper Mono'
export const COVERAGE_MIN = 0.008
export const IMPLODE = 0.11
export const WAVE_LIFE = 1600
export const OVERSAMPLE = 6

export const CYMBALS = [
  { x: 0.147, y: 0.516, rx: 0.126, ry: 0.155 }, // left cymbal
  { x: 0.86, y: 0.311, rx: 0.128, ry: 0.167 }, // right cymbal
] as const

// Drum heads, as normalized ellipses. Together with the cymbals these are the
// only regions that trigger the click pulse.
export const HEADS = [
  { x: 0.558, y: 0.478, rx: 0.112, ry: 0.069 }, // snare
  { x: 0.366, y: 0.538, rx: 0.1, ry: 0.121 }, // floor tom (left)
  { x: 0.45, y: 0.235, rx: 0.079, ry: 0.095 }, // rack tom (left)
  { x: 0.64, y: 0.25, rx: 0.086, ry: 0.105 }, // rack tom (right)
  { x: 0.743, y: 0.59, rx: 0.098, ry: 0.124 }, // floor tom (right)
] as const

export const CLICK_TARGETS = [...CYMBALS, ...HEADS]

export const GLYPH_BANDS = [
  ' ',
  '.`',
  ',:',
  ';-',
  '_~',
  '+=',
  'xX*',
  '01io',
  '[]{}()',
  '<>/\\|',
  '#%&@$',
] as const

export const SCRAMBLE_POOL = '.:;-+*=xXoO0#%@$<>/\\|[]{}()'