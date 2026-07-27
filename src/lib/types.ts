import { INK, SERIES } from './theme'

export interface AlertRow {
  id: number
  source_table: string
  source_rowid: number
  alert_type: string
  wallet_address: string | null
  asset_id: string | null
  market_title: string | null
  timestamp_ms: number | null
  payload: Record<string, unknown>
  created_at: string
}

export interface WalletRow {
  address: string
  label: string | null
  suspicious_score: number
  info_score: number
  forensic_score: number
  deception_score: number
  roi_estimate: number
  trades_count: number
  win_count: number
  total_volume: number
  total_profit: number
  first_seen_ms: number | null
  last_seen_ms: number | null
  profile: Record<string, unknown> | null
  updated_at: string
}

/**
 * One live exposure row: which outcome token, held how big, at what entry.
 * Mirrors public.positions (fed from GET /positions -> ExposureTracker).
 */
export interface PositionRow {
  wallet_address: string
  asset_id: string
  condition_id: string | null
  market_title: string | null
  /** 'Yes' / 'No' -- which option. Empty when the fill did not report it. */
  outcome: string | null
  /** Signed: positive is long, negative is short. */
  net_contracts: number
  avg_entry_price: number
  notional_usd: number
  total_bought: number
  total_sold: number
  realized_pnl: number
  unrealized_pnl: number
  last_price: number
  trade_count: number
  first_trade_ms: number | null
  last_trade_ms: number | null
  updated_at: string
}

/**
 * One detected TWAP window: a large order sliced into near-constant chunks at
 * a metronome cadence, inside a single condition_id.
 * Mirrors public.twap_patterns (fed from the twap_alerts source table).
 *
 * NOTE: the detector also computes size_cv and cadence_cv -- the coefficients
 * of variation that decide whether a window IS a TWAP -- but neither is
 * persisted (see AlertDatabase.cpp, twap_alerts DDL), so nothing downstream
 * can display them. Do not synthesize a "regularity score" here: everything
 * below is a stored measurement.
 */
export interface TwapPatternRow {
  id: number
  /** Joins alerts.source_rowid where alerts.source_table = 'twap_alerts'. */
  source_rowid: number
  condition_id: string
  market_slug: string | null
  /** Oldest trade in the window, epoch ms. */
  start_time: number | null
  /** Newest trade -- the one that tripped the detector. */
  end_time: number | null
  trade_count: number | null
  /** Shares per slice. */
  avg_size: number | null
  /** Shares, summed over the window. */
  total_volume: number | null
  /** Mean inter-trade interval. */
  cadence_seconds: number | null
  /** Distinct known wallets seen in the window; may be empty. */
  wallets: string[] | null
  created_at: string
}

/**
 * Window duration in ms. Derived, not stored -- but from two stored endpoints,
 * so it states nothing the row does not already contain.
 */
export function twapDuration(p: TwapPatternRow): number | null {
  if (!p.start_time || !p.end_time || p.end_time < p.start_time) return null
  return p.end_time - p.start_time
}

/**
 * More than one wallet slicing the same book in one window is the coordinated
 * case, and it is the question an analyst asks first -- so it carries the
 * identity color everywhere TWAP is drawn.
 */
export function isCoordinated(p: TwapPatternRow): boolean {
  return (p.wallets?.length ?? 0) > 1
}

/** One outcome token inside a cluster's combined book. */
export interface ClusterLeg {
  asset_id: string
  condition_id: string
  market_title: string
  outcome: string
  /** Cluster members holding this token. */
  wallets: number
  net_contracts: number
  notional_usd: number
  avg_entry_price: number
  last_trade_ms: number
}

/**
 * A correlation cluster and what the group holds TOGETHER -- the number that
 * matters for coordinated accumulation, never the single operation.
 * Mirrors public.clusters (fed from GET /clusters).
 */
export interface ClusterRow {
  /** Lowest member address; stable id. */
  cluster_key: string
  /** Member addresses, lowercase. */
  wallets: string[]
  wallet_count: number
  wallets_with_positions: number
  total_notional_usd: number
  gross_contracts: number
  realized_pnl: number
  unrealized_pnl: number
  market_count: number
  /** Per-outcome breakdown, biggest notional first. */
  legs: ClusterLeg[] | null
  updated_at: string
}

/**
 * Outcome side. Two values that read as opposite, so they take a warm/cool
 * pair; the word is always printed beside the swatch, never color alone.
 */
export function outcomeColor(outcome: string | null | undefined): string {
  const o = (outcome ?? '').trim().toLowerCase()
  if (o === 'yes') return SERIES[0]
  if (o === 'no') return SERIES[1]
  return INK.muted
}

export const ALERT_TYPE_LABELS: Record<string, string> = {
  oracle_move: 'Oracle Move',
  suspect_trade: 'Suspect Trade',
  twap_pattern: 'TWAP Pattern',
  deception_alert: 'Deception',
  cluster_move: 'Cluster Move',
  wallet_alert: 'Wallet/Hot',
}

/**
 * Alert type -> categorical slot, in fixed order. The mapping is bound to the
 * entity, so filtering the feed never repaints the surviving types. Unknown
 * types fall back to muted ink rather than borrowing a slot.
 */
export const ALERT_TYPE_ORDER = [
  'oracle_move',
  'suspect_trade',
  'twap_pattern',
  'deception_alert',
  'cluster_move',
  'wallet_alert',
] as const

export const ALERT_TYPE_COLORS: Record<string, string> = Object.fromEntries(
  ALERT_TYPE_ORDER.map((type, i) => [type, SERIES[i]]),
)

export function alertColor(type: string): string {
  return ALERT_TYPE_COLORS[type] ?? INK.muted
}

export function alertLabel(type: string): string {
  return ALERT_TYPE_LABELS[type] ?? type.replaceAll('_', ' ').toUpperCase()
}

export function shortAddress(address: string | null | undefined): string {
  if (!address) return '—'
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address
}

export function formatTs(ms: number | null | undefined): string {
  if (!ms) return '—'
  return new Date(ms).toLocaleString('it-IT')
}
