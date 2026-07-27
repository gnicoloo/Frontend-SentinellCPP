// Cross-sectional helpers. Kept free of React and chart libraries so the
// numbers a chart draws can be reasoned about (and tested) on their own.

export interface Bin {
  x0: number
  x1: number
  count: number
}

/** Equal-width bins over [min, max]. The max always lands in the last bin. */
export function binize(values: number[], bins: number): Bin[] {
  if (values.length === 0 || bins < 1) return []
  const min = Math.min(...values)
  const max = Math.max(...values)
  // A degenerate population (every value identical) still needs a finite width.
  const width = (max - min) / bins || 1
  const out: Bin[] = Array.from({ length: bins }, (_, i) => ({
    x0: min + i * width,
    x1: min + (i + 1) * width,
    count: 0,
  }))
  for (const v of values) {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor((v - min) / width)))
    out[idx].count += 1
  }
  return out
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

/** Value at percentile `p` (0..100) of an unsorted population. */
export function quantile(xs: number[], p: number): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]
}
