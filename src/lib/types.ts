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
