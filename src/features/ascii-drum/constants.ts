export const FONT = 'Paper Mono'
export const COVERAGE_MIN = 0.008
export const IMPLODE = 0.11
export const WAVE_LIFE = 1600
export const OVERSAMPLE = 6

export const CYMBALS = [
  { x: 0.147, y: 0.53, rx: 0.14, ry: 0.17 },
  { x: 0.86, y: 0.31, rx: 0.14, ry: 0.17 },
] as const

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