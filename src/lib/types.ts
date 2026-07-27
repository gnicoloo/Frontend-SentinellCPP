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
}

export const ALERT_TYPE_COLORS: Record<string, string> = {
  oracle_move: '#a78bfa',
  suspect_trade: '#f87171',
  twap_pattern: '#38bdf8',
  deception_alert: '#fbbf24',
  cluster_move: '#34d399',
}

export function shortAddress(address: string | null | undefined): string {
  if (!address) return '—'
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address
}

export function formatTs(ms: number | null | undefined): string {
  if (!ms) return '—'
  return new Date(ms).toLocaleString('it-IT')
}
