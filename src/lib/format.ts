// Number / time formatting shared by every readout.
// Columns use tabular figures (see index.css .num); large standalone values use
// proportional figures, so these helpers never assume a width.

/** 1,284 -> "1,284" | 12,900 -> "12.9K" | 4,200,000 -> "4.2M" */
export function compact(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (abs >= 1e4) return `${(n / 1e3).toFixed(1)}K`
  return Math.round(n).toLocaleString('en-US')
}

export function usd(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return `$${compact(n)}`
}

export function pct(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return `${(n * 100).toFixed(digits)}%`
}

/** Signed percentage with a direction glyph, so color is never the only cue. */
export function signedPct(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  const glyph = n > 0 ? '▲' : n < 0 ? '▼' : '='
  return `${glyph} ${Math.abs(n * 100).toFixed(digits)}%`
}

/** Period-over-period change as a ratio; null when the base period was empty. */
export function changeRatio(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null
  return (current - previous) / previous
}

export function hhmm(ms: number | null | undefined): string {
  if (!ms) return '—'
  return new Date(ms).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

export function ymd(ms: number | null | undefined): string {
  if (!ms) return '—'
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * A span, not a clock time: "45s" / "12m" / "3.2h". Cadence and window length
 * range over three orders of magnitude, so the unit floats with the value.
 */
export function duration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return '—'
  const s = ms / 1000
  if (s < 90) return `${s.toFixed(s < 10 ? 1 : 0)}s`
  if (s < 5400) return `${(s / 60).toFixed(s < 600 ? 1 : 0)}m`
  return `${(s / 3600).toFixed(1)}h`
}

/** "3m" / "4h" / "6d" -- terminal-tape age, right-aligned in feeds. */
export function ago(ms: number | null | undefined): string {
  if (!ms) return '—'
  const s = Math.max(0, (Date.now() - ms) / 1000)
  if (s < 60) return `${Math.floor(s)}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

/**
 * Where `value` sits in `sorted` (ascending), 0..1. Gives every raw score the
 * cross-sectional context an analyst actually reads it against.
 */
export function percentileOf(value: number, sorted: number[]): number {
  if (sorted.length === 0) return 0
  let lo = 0
  let hi = sorted.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sorted[mid] <= value) lo = mid + 1
    else hi = mid
  }
  return lo / sorted.length
}

/** "1st" / "2nd" / "83rd" -- percentile rank as an ordinal. */
export function ordinal(n: number): string {
  const v = Math.round(n)
  const rem100 = v % 100
  if (rem100 >= 11 && rem100 <= 13) return `${v}th`
  switch (v % 10) {
    case 1: return `${v}st`
    case 2: return `${v}nd`
    case 3: return `${v}rd`
    default: return `${v}th`
  }
}
