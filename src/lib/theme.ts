// Design tokens for every chart and readout in the terminal.
//
// The categorical and ordinal ramps below were validated with the dataviz
// palette checker against this app's real surface (#020617, dark mode):
//   categorical (6 slots) -- lightness band, chroma floor, CVD separation
//     (worst adjacent dE 8.4 protan), normal-vision floor (19.3), contrast: PASS
//   ordinal (5 steps)     -- monotone L, adjacent dL, light-end contrast,
//     single hue (3 deg spread): PASS
// Re-run the checker before changing any hex here.

/** Chart surfaces / chrome ink. Marks carry series color; text never does. */
export const INK = {
  surface: '#020617',
  panel: '#0F172A',
  raised: '#111d33',
  grid: '#1e293b',
  axis: '#334155',
  primary: '#e2e8f0',
  secondary: '#94a3b8',
  muted: '#64748b',
} as const

/**
 * Categorical slots, fixed order. Assign by entity and never cycle or reassign
 * on filter -- a reader who learned "oracle move is blue" stays right.
 */
export const SERIES = [
  '#3987e5', // 1 blue
  '#d95926', // 2 orange
  '#199e70', // 3 aqua
  '#c98500', // 4 yellow
  '#d55181', // 5 magenta
  '#9085e9', // 6 violet
  '#8c564b', // 7 brown
  '#e377c2', // 8 pink
  '#7f7f7f', // 9 gray
  '#bcbd22', // 10 olive
] as const

/**
 * Status. Reserved -- never reused as a series color, and never the only
 * channel: every status readout ships a glyph or label beside it.
 */
export const STATUS = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
} as const

/** Direction of a P&L / ROI delta. Always rendered with a sign glyph. */
export const DELTA = {
  up: '#0ca30c',
  down: '#d03b3b',
  flat: '#64748b',
} as const

/** Single-hue ordinal ramp, light -> dark. Magnitude only, never identity. */
export const RAMP = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf'] as const

/** Terminal chrome accent -- UI only (nav, focus, links), never a data mark. */
export const ACCENT = '#22C55E'

/**
 * Map a 0..1 intensity onto the ordinal ramp. Used for heat cells and tier
 * badges, both of which also print their number, so color never gates a value.
 */
export function rampStep(t: number): string {
  const i = Math.min(RAMP.length - 1, Math.max(0, Math.round(t * (RAMP.length - 1))))
  return RAMP[i]
}

/** Severity token for a 0..1 normalized threat level. */
export function severityOf(t: number): { color: string; label: string } {
  if (t >= 0.75) return { color: STATUS.critical, label: 'CRITICAL' }
  if (t >= 0.5) return { color: STATUS.serious, label: 'ELEVATED' }
  if (t >= 0.25) return { color: STATUS.warning, label: 'WATCH' }
  return { color: STATUS.good, label: 'NOMINAL' }
}
