// Server-side aggregates.
//
// Every figure here used to be computed in the browser from a capped row fetch.
// That worked until the window held more rows than the cap: Postgres then
// returned only the NEWEST rows, so a 30-day chart drew a single day and every
// "vs prior window" delta compared a full window against an empty one. These
// wrappers move the aggregation into Postgres (see the functions at the bottom
// of schema_supabase.sql), which makes the payload proportional to the number
// of buckets rather than to the number of alerts.
//
// They THROW on a failed request instead of returning empty. A surveillance
// view that renders a fetch failure as a flat line invites the worst possible
// misreading -- "nothing is happening" when the truth is "nothing was read".

import { supabase } from './supabaseClient'
import { bucketCount, densify, densifySeries, type Bucket, type RangeDef } from './range'

export type Dimension = 'wallet' | 'market'

export interface AlertFilters {
  /** Exact address -- the wallet detail page. Uses the index. */
  wallet?: string | null
  /** Substring match, mirroring the Explorer's ilike filter. */
  walletLike?: string | null
  market?: string | null
  types?: string[] | null
}

export interface WindowStats {
  total: number
  severe: number
  wallets: number
  markets: number
}

export interface TopEntity {
  key: string
  total: number
  wallets: number
  dominant: string | null
  /** Every distinct alert type seen on this entity, not just the dominant. */
  types: string[] | null
}

export interface PositionTotals {
  notional: number
  unrealized: number
  openLegs: number
  wallets: number
  tokens: number
}

export interface ExposureMarket {
  name: string
  notional: number
  unrealized: number
  wallets: number
  dominant: string | null
}

/** One place to turn a PostgREST error into something a caller cannot ignore. */
async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T[]> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(`${fn}: ${error.message}`)
  return (data as T[]) ?? []
}

/** Alert flow per bucket, split by alert_type -- the shared time plot. */
export async function alertBuckets(
  def: RangeDef,
  start: number,
  end: number,
  filters: AlertFilters = {},
): Promise<Bucket[]> {
  const count = bucketCount(def, start, end)
  const rows = await rpc<{ bucket_index: number; alert_type: string; n: number }>('alert_buckets', {
    p_start: start,
    p_end: end,
    p_buckets: count,
    p_wallet: filters.wallet?.trim() || null,
    p_wallet_like: filters.walletLike?.trim() || null,
    p_market: filters.market?.trim() || null,
    p_types: filters.types?.length ? filters.types : null,
  })
  return densify(
    rows.map((r) => ({ bucket_index: r.bucket_index, key: r.alert_type, n: r.n })),
    count,
    start,
    end,
  )
}

/** Exact KPI counts for one window. Call twice to get an honest delta. */
export async function alertWindowStats(
  start: number,
  end: number,
  severe: string[],
  wallet: string | null = null,
): Promise<WindowStats> {
  const rows = await rpc<WindowStats>('alert_window_stats', {
    p_start: start,
    p_end: end,
    p_severe: severe,
    p_wallet: wallet,
  })
  return rows[0] ?? { total: 0, severe: 0, wallets: 0, markets: 0 }
}

/**
 * A window covering everything. The wallet page ranks a wallet's books over its
 * whole history, not over the active range, and says so in the panel meta.
 */
export const LIFETIME = { start: 0, end: Number.MAX_SAFE_INTEGER }

/** Top markets or wallets by flow, with their dominant alert type. */
export async function alertTopEntities(
  start: number,
  end: number,
  dimension: Dimension,
  limit = 8,
  wallet: string | null = null,
): Promise<TopEntity[]> {
  return rpc<TopEntity>('alert_top_entities', {
    p_start: start,
    p_end: end,
    p_dimension: dimension,
    p_limit: limit,
    p_wallet: wallet,
  })
}

/**
 * Sparkline series for an explicit key set, so a page fetches shapes only for
 * the rows it actually renders. Returns a dense array per key.
 */
export async function alertEntitySeries(
  def: RangeDef,
  start: number,
  end: number,
  dimension: Dimension,
  keys: string[],
): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>()
  if (keys.length === 0) return out
  const count = bucketCount(def, start, end)
  const rows = await rpc<{ key: string; bucket_index: number; n: number }>('alert_entity_series', {
    p_start: start,
    p_end: end,
    p_buckets: count,
    p_dimension: dimension,
    p_keys: keys,
  })
  const grouped = new Map<string, { bucket_index: number; n: number }[]>()
  for (const r of rows) {
    const list = grouped.get(r.key)
    if (list) list.push(r)
    else grouped.set(r.key, [r])
  }
  for (const key of keys) out.set(key, densifySeries(grouped.get(key) ?? [], count))
  return out
}

/** Exact alert count per wallet in a window. */
export async function alertWalletCounts(
  start: number,
  end: number,
  addresses: string[],
): Promise<Map<string, number>> {
  if (addresses.length === 0) return new Map()
  const rows = await rpc<{ wallet_address: string; n: number }>('alert_wallet_counts', {
    p_start: start,
    p_end: end,
    p_addresses: addresses,
  })
  return new Map(rows.map((r) => [r.wallet_address, r.n]))
}

/** Whole-book exposure. A live snapshot, so it takes no window. */
export async function positionTotals(): Promise<PositionTotals> {
  const rows = await rpc<{
    notional: number; unrealized: number; open_legs: number; wallets: number; tokens: number
  }>('position_totals', {})
  const r = rows[0]
  return {
    notional: r?.notional ?? 0,
    unrealized: r?.unrealized ?? 0,
    openLegs: r?.open_legs ?? 0,
    wallets: r?.wallets ?? 0,
    tokens: r?.tokens ?? 0,
  }
}

export async function positionTopMarkets(limit = 8): Promise<ExposureMarket[]> {
  return rpc<ExposureMarket>('position_top_markets', { p_limit: limit })
}

/** Per-wallet book totals for an explicit address set. */
export async function positionWalletTotals(
  addresses: string[],
): Promise<Map<string, { notional: number; unrealized: number }>> {
  if (addresses.length === 0) return new Map()
  const rows = await rpc<{ wallet_address: string; notional: number; unrealized: number }>(
    'position_wallet_totals',
    { p_addresses: addresses },
  )
  return new Map(rows.map((r) => [r.wallet_address, { notional: r.notional, unrealized: r.unrealized }]))
}
