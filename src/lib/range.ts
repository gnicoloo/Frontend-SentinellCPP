// Global time range presets + the bucketing every time series shares.
// One range scopes the whole view, so the KPI tiles, the charts and the tables
// can never disagree about which slice they are describing.

export type RangeKey = '1h' | '6h' | '24h' | '7d' | '30d'

export interface RangeDef {
  key: RangeKey
  label: string
  /** Window width in ms. */
  span: number
  /** Bucket width in ms -- chosen to land on 12..30 buckets per window. */
  bucket: number
  /** Axis tick renderer for a bucket start. */
  tick: (ms: number) => string
  /** Tooltip header for a bucket start. */
  stamp: (ms: number) => string
}

const HOUR = 3600_000
const DAY = 24 * HOUR

const time = (ms: number) =>
  new Date(ms).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
const day = (ms: number) => new Date(ms).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })
const full = (ms: number) => new Date(ms).toLocaleString('it-IT')

export const RANGES: RangeDef[] = [
  { key: '1h', label: '1H', span: HOUR, bucket: 5 * 60_000, tick: time, stamp: full },
  { key: '6h', label: '6H', span: 6 * HOUR, bucket: 30 * 60_000, tick: time, stamp: full },
  { key: '24h', label: '24H', span: DAY, bucket: HOUR, tick: time, stamp: full },
  { key: '7d', label: '7D', span: 7 * DAY, bucket: 6 * HOUR, tick: day, stamp: full },
  { key: '30d', label: '30D', span: 30 * DAY, bucket: DAY, tick: day, stamp: day },
]

export const DEFAULT_RANGE: RangeKey = '24h'

export function rangeDef(key: RangeKey): RangeDef {
  return RANGES.find((r) => r.key === key) ?? RANGES[2]
}

export interface Bucket {
  /** Bucket start, ms. */
  t: number
  /** Total across every series in this bucket. */
  total: number
  /** One count per series key. */
  [series: string]: number
}

/**
 * Series are bucketed in Postgres (see the aggregates in schema_supabase.sql)
 * and densified here. There is deliberately no "bucket these rows client-side"
 * helper any more: counting a fetched page only ever described the slice the
 * row cap admitted, which is what made long ranges collapse to a single day.
 *
 * The grid is anchored to the caller's exact [start, end] rather than to a
 * global clock grid: that is what makes a chart's total equal the KPI computed
 * over the same window. Snapping to round clock edges instead would push the
 * last column past `now` and silently drop up to one bucket of real history.
 *
 * How many buckets a window splits into. The aggregates take this as a
 * parameter and index rows with the same formula, so a bucket built in Postgres
 * and one built here always describe the same slice of time.
 */
export function bucketCount(def: RangeDef, start: number, end: number): number {
  return Math.max(1, Math.round((end - start) / def.bucket))
}

/** The empty grid every densifier fills. */
function emptyBuckets(count: number, start: number, end: number): Bucket[] {
  const width = (end - start) / count
  const buckets: Bucket[] = []
  for (let i = 0; i < count; i++) buckets.push({ t: start + i * width, total: 0 })
  return buckets
}

/**
 * Turn `(bucket_index, series, n)` rows from an aggregate into the dense,
 * gap-free series the charts expect. Absent buckets stay zero, exactly as
 * bucketize() would have emitted them from raw rows.
 */
export function densify(
  rows: { bucket_index: number; key: string; n: number }[],
  count: number,
  start: number,
  end: number,
): Bucket[] {
  const buckets = emptyBuckets(count, start, end)
  for (const r of rows) {
    const b = buckets[r.bucket_index]
    if (!b) continue
    b[r.key] = ((b[r.key] as number) ?? 0) + r.n
    b.total += r.n
  }
  return buckets
}

/** The single-series form -- sparklines want plain numbers, not buckets. */
export function densifySeries(
  rows: { bucket_index: number; n: number }[],
  count: number,
): number[] {
  const out = new Array<number>(count).fill(0)
  for (const r of rows) {
    if (r.bucket_index >= 0 && r.bucket_index < count) out[r.bucket_index] += r.n
  }
  return out
}

/** Window bounds for a range, plus the equal-length window before it. */
export function windows(key: RangeKey, now = Date.now()) {
  const { span } = rangeDef(key)
  return {
    start: now - span,
    end: now,
    prevStart: now - 2 * span,
    prevEnd: now - span,
  }
}
