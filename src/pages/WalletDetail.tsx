import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
} from 'recharts'
import { supabase } from '../lib/supabaseClient'
import {
  ALERT_TYPE_COLORS, ALERT_TYPE_LABELS, formatTs, shortAddress,
  type AlertRow, type WalletRow,
} from '../lib/types'

function ScoreBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100)
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-400">
        <span>{label}</span>
        <span className="font-semibold text-slate-200">{value.toFixed(2)} / {max}</span>
      </div>
      <div className="mt-1 h-2 rounded bg-white/10">
        <div className="h-2 rounded" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

const SUB_SCORES: { key: string; label: string }[] = [
  { key: 'winrate_score', label: 'Winrate' },
  { key: 'streak_score', label: 'Streak' },
  { key: 'volume_score', label: 'Volume' },
  { key: 'profit_score', label: 'Profit' },
  { key: 'markets_score', label: 'Mercati' },
  { key: 'timing_score', label: 'Timing' },
  { key: 'event_score', label: 'Eventi' },
  { key: 'cluster_score', label: 'Cluster' },
]

export default function WalletDetail() {
  const { address = '' } = useParams()
  const [wallet, setWallet] = useState<WalletRow | null>(null)
  const [alerts, setAlerts] = useState<AlertRow[]>([])
  const [deceptionScore, setDeceptionScore] = useState<number | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    const load = async () => {
      const [walletRes, alertsRes, deceptionRes] = await Promise.all([
        supabase.from('wallets').select('*').eq('address', address).maybeSingle(),
        supabase.from('alerts').select('*').eq('wallet_address', address).order('id', { ascending: false }).limit(50),
        supabase.from('deception_alerts').select('deception_score').eq('wallet_address', address).order('id', { ascending: false }).limit(1),
      ])
      setWallet((walletRes.data as WalletRow) ?? null)
      setNotFound(!walletRes.data)
      setAlerts((alertsRes.data as AlertRow[]) ?? [])
      const d = deceptionRes.data as { deception_score: number }[] | null
      setDeceptionScore(d && d.length > 0 ? d[0].deception_score : null)
    }
    void load()
  }, [address])

  const profile = (wallet?.profile ?? {}) as Record<string, number>
  const radarData = SUB_SCORES.map((s) => ({
    subject: s.label,
    value: Math.round(((profile[s.key] as number | undefined) ?? 0) * 100) / 100,
  }))

  const winRate = wallet && wallet.trades_count > 0 ? wallet.win_count / wallet.trades_count : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/wallets" className="text-sm text-slate-500 hover:text-slate-300">← Wallet</Link>
        <h2 className="font-mono text-lg font-bold">{shortAddress(address)}</h2>
        {wallet?.label && <span className="rounded bg-red-400/15 px-2 py-0.5 text-xs text-red-300">{wallet.label}</span>}
        <a
          href={`https://polygonscan.com/address/${address}`}
          target="_blank"
          rel="noreferrer"
          className="ml-auto text-sm text-sentinel-accent hover:underline"
        >
          Polygonscan ↗
        </a>
      </div>

      {notFound && (
        <p className="rounded border border-sentinel-border bg-sentinel-panel p-4 text-sm text-slate-500">
          Wallet non presente nella tabella <code>wallets</code> (sync non ancora eseguito?). Sotto trovi comunque i suoi alert.
        </p>
      )}

      {wallet && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="rounded-lg border border-sentinel-border bg-sentinel-panel p-4">
              <p className="text-xs uppercase text-slate-500">ROI stimato</p>
              <p className="mt-1 text-2xl font-bold text-emerald-400">{(wallet.roi_estimate * 100).toFixed(0)}%</p>
            </div>
            <div className="rounded-lg border border-sentinel-border bg-sentinel-panel p-4">
              <p className="text-xs uppercase text-slate-500">Win rate</p>
              <p className="mt-1 text-2xl font-bold">{(winRate * 100).toFixed(0)}%</p>
              <p className="text-xs text-slate-500">{wallet.win_count}/{wallet.trades_count} trade</p>
            </div>
            <div className="rounded-lg border border-sentinel-border bg-sentinel-panel p-4">
              <p className="text-xs uppercase text-slate-500">Volume</p>
              <p className="mt-1 text-2xl font-bold">${Math.round(wallet.total_volume).toLocaleString('it-IT')}</p>
            </div>
            <div className="rounded-lg border border-sentinel-border bg-sentinel-panel p-4">
              <p className="text-xs uppercase text-slate-500">Ultimo trade</p>
              <p className="mt-1 text-sm font-semibold">{formatTs(wallet.last_seen_ms)}</p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4 rounded-lg border border-sentinel-border bg-sentinel-panel p-4">
              <h3 className="text-sm font-semibold text-slate-400">Punteggi</h3>
              <ScoreBar label="Suspicious score" value={wallet.suspicious_score} max={10} color="#f87171" />
              <ScoreBar label="Info score" value={wallet.info_score} max={100} color="#38bdf8" />
              <ScoreBar label="Forensic score" value={wallet.forensic_score} max={10} color="#a78bfa" />
              {deceptionScore !== null && (
                <ScoreBar label="Deception score" value={deceptionScore} max={1} color="#fbbf24" />
              )}
            </div>

            <div className="rounded-lg border border-sentinel-border bg-sentinel-panel p-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-400">Sotto-score comportamentali</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#1e2a44" />
                    <PolarAngleAxis dataKey="subject" stroke="#64748b" fontSize={11} />
                    <PolarRadiusAxis domain={[0, 1]} stroke="#334155" fontSize={10} />
                    <Radar dataKey="value" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.35} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="rounded-lg border border-sentinel-border bg-sentinel-panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-400">Timeline alert ({alerts.length})</h3>
          <Link to="/clusters" className="text-sm text-sentinel-accent hover:underline">Cluster Graph →</Link>
        </div>
        {alerts.length === 0 && <p className="text-sm text-slate-500">Nessun alert per questo wallet.</p>}
        <ul className="max-h-96 space-y-1 overflow-y-auto">
          {alerts.map((a) => (
            <li key={`${a.source_table}-${a.source_rowid}`} className="flex items-center gap-3 rounded px-3 py-2 text-sm hover:bg-white/5">
              <span className="rounded px-2 py-0.5 text-xs font-semibold" style={{ background: `${ALERT_TYPE_COLORS[a.alert_type] ?? '#64748b'}22`, color: ALERT_TYPE_COLORS[a.alert_type] ?? '#94a3b8' }}>
                {ALERT_TYPE_LABELS[a.alert_type] ?? a.alert_type}
              </span>
              <span className="min-w-0 flex-1 truncate text-slate-400">{a.market_title ?? a.asset_id ?? ''}</span>
              <span className="shrink-0 text-xs text-slate-500">{formatTs(a.timestamp_ms)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
