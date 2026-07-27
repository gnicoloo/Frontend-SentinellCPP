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
      <div className="flex justify-between text-[10px] font-mono text-slate-400 uppercase tracking-wider">
        <span>{label}</span>
        <span className="font-semibold" style={{ color: color }}>{value.toFixed(2)} / {max}</span>
      </div>
      <div className="mt-1 h-1.5 bg-sentinel-border/50">
        <div className="h-1.5" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

const SUB_SCORES: { key: string; label: string }[] = [
  { key: 'winrate_score', label: 'Winrate' },
  { key: 'streak_score', label: 'Streak' },
  { key: 'volume_score', label: 'Volume' },
  { key: 'profit_score', label: 'Profit' },
  { key: 'markets_score', label: 'Markets' },
  { key: 'timing_score', label: 'Timing' },
  { key: 'event_score', label: 'Events' },
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
    subject: s.label.toUpperCase(),
    value: Math.round(((profile[s.key] as number | undefined) ?? 0) * 100) / 100,
  }))

  const winRate = wallet && wallet.trades_count > 0 ? wallet.win_count / wallet.trades_count : 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 border-b border-sentinel-border pb-2">
        <Link to="/wallets" className="text-xs font-mono text-slate-500 hover:text-slate-300">{'<'} WALLETS</Link>
        <h2 className="font-mono text-sm text-sentinel-accent tracking-widest uppercase">ID: {shortAddress(address)}</h2>
        {wallet?.label && <span className="border border-sentinel-destructive px-2 py-0.5 text-[10px] uppercase font-bold text-sentinel-destructive">{wallet.label}</span>}
        <a
          href={`https://polygonscan.com/address/${address}`}
          target="_blank"
          rel="noreferrer"
          className="ml-auto text-[10px] font-mono text-sentinel-accent hover:underline uppercase border border-sentinel-accent/50 px-2 py-1"
        >
          POLYGONSCAN {'>>'}
        </a>
      </div>

      {notFound && (
        <p className="border border-sentinel-border bg-sentinel-panel p-3 text-[10px] font-mono text-slate-500 uppercase">
          [WARN] Wallet not found in registry. Showing related alerts only.
        </p>
      )}

      {wallet && (
        <>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <div className="border-l-2 border-sentinel-accent bg-sentinel-panel p-3">
              <p className="text-[10px] font-mono uppercase text-slate-500 tracking-wider">EST. ROI</p>
              <p className={`mt-1 text-xl font-mono ${wallet.roi_estimate >= 0 ? 'text-sentinel-accent' : 'text-sentinel-destructive'}`}>{(wallet.roi_estimate * 100).toFixed(0)}%</p>
            </div>
            <div className="border-l-2 border-sentinel-border bg-sentinel-panel p-3">
              <p className="text-[10px] font-mono uppercase text-slate-500 tracking-wider">WIN RATE</p>
              <p className="mt-1 text-xl font-mono text-slate-200">{(winRate * 100).toFixed(0)}%</p>
              <p className="text-[9px] font-mono text-slate-500">{wallet.win_count}/{wallet.trades_count} TX</p>
            </div>
            <div className="border-l-2 border-sentinel-border bg-sentinel-panel p-3">
              <p className="text-[10px] font-mono uppercase text-slate-500 tracking-wider">TOTAL VOL</p>
              <p className="mt-1 text-xl font-mono text-slate-200">${Math.round(wallet.total_volume).toLocaleString('en-US')}</p>
            </div>
            <div className="border-l-2 border-sentinel-border bg-sentinel-panel p-3">
              <p className="text-[10px] font-mono uppercase text-slate-500 tracking-wider">LAST TX</p>
              <p className="mt-1 text-sm font-mono text-slate-200">{formatTs(wallet.last_seen_ms).split(' ')[0]}</p>
              <p className="text-[10px] font-mono text-slate-500">{formatTs(wallet.last_seen_ms).split(' ')[1]}</p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-4 border border-sentinel-border bg-sentinel-panel p-4">
              <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400 border-b border-sentinel-border pb-2">THREAT SCORES</h3>
              <ScoreBar label="Suspicious" value={wallet.suspicious_score} max={10} color="#EF4444" />
              <ScoreBar label="Info" value={wallet.info_score} max={100} color="#22C55E" />
              <ScoreBar label="Forensic" value={wallet.forensic_score} max={10} color="#A855F7" />
              {deceptionScore !== null && (
                <ScoreBar label="Deception" value={deceptionScore} max={1} color="#EAB308" />
              )}
            </div>

            <div className="border border-sentinel-border bg-sentinel-panel flex flex-col p-4">
              <h3 className="mb-2 text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400 border-b border-sentinel-border pb-2">BEHAVIORAL VECTOR</h3>
              <div className="flex-1 h-48 md:h-64 mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#334155" />
                    <PolarAngleAxis dataKey="subject" stroke="#64748b" fontSize={9} fontFamily="monospace" />
                    <PolarRadiusAxis domain={[0, 1]} stroke="#334155" fontSize={0} tick={false} axisLine={false} />
                    <Radar dataKey="value" stroke="#22C55E" fill="#22C55E" fillOpacity={0.2} strokeWidth={1} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="border border-sentinel-border bg-sentinel-panel">
        <div className="flex items-center justify-between border-b border-sentinel-border p-3 pb-2">
          <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400">ALERT TIMELINE ({alerts.length})</h3>
          <Link to="/clusters" className="text-[10px] font-mono text-sentinel-accent hover:underline uppercase border border-sentinel-accent/50 px-2 py-1">CLUSTER_GRAPH {'>>'}</Link>
        </div>
        {alerts.length === 0 && <p className="p-3 text-[10px] font-mono text-slate-500">NO_EVENTS_LOGGED.</p>}
        <ul className="max-h-64 overflow-y-auto">
          {alerts.map((a) => (
            <li key={`${a.source_table}-${a.source_rowid}`} className="flex items-center gap-2 border-b border-sentinel-border/50 px-3 py-1.5 hover:bg-sentinel-border/30 transition-colors">
              <span className="shrink-0 border px-1 py-0.5 text-[9px] font-mono font-bold uppercase w-20 text-center" style={{ 
                  borderColor: ALERT_TYPE_COLORS[a.alert_type] === '#38bdf8' ? '#22C55E' : ALERT_TYPE_COLORS[a.alert_type] ?? '#64748b', 
                  color: ALERT_TYPE_COLORS[a.alert_type] === '#38bdf8' ? '#22C55E' : ALERT_TYPE_COLORS[a.alert_type] ?? '#94a3b8' 
                }}>
                {ALERT_TYPE_LABELS[a.alert_type] ?? a.alert_type}
              </span>
              <span className="min-w-0 flex-1 truncate text-[10px] font-mono text-slate-300">{a.market_title ?? a.asset_id ?? 'UNKNOWN_MARKET'}</span>
              <span className="shrink-0 text-[10px] font-mono text-slate-500">{formatTs(a.timestamp_ms)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
