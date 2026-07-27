import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import { supabase } from '../lib/supabaseClient'
import {
  ALERT_TYPE_COLORS, ALERT_TYPE_LABELS, formatTs, shortAddress,
  type AlertRow, type WalletRow,
} from '../lib/types'

interface Kpis {
  alerts24h: number
  walletsTracked: number
  twapDetected: number
  suspectTrades: number
}

function KpiCard({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div className="border-l-2 border-sentinel-border bg-sentinel-panel p-3" style={{ borderLeftColor: accent ?? '#334155' }}>
      <p className="text-[10px] uppercase font-mono tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-mono" style={{ color: accent ?? '#e2e8f0' }}>
        {value}
      </p>
    </div>
  )
}

export default function Dashboard() {
  const [kpis, setKpis] = useState<Kpis>({ alerts24h: 0, walletsTracked: 0, twapDetected: 0, suspectTrades: 0 })
  const [recent, setRecent] = useState<AlertRow[]>([])
  const [topWallets, setTopWallets] = useState<WalletRow[]>([])
  const [weekAlerts, setWeekAlerts] = useState<AlertRow[]>([])

  const load = async () => {
    const since24h = Date.now() - 24 * 3600 * 1000
    const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()

    const [alerts24h, wallets, twap, suspects, recentRes, topRes, weekRes] = await Promise.all([
      supabase.from('alerts').select('id', { count: 'exact', head: true }).gte('timestamp_ms', since24h),
      supabase.from('wallets').select('address', { count: 'exact', head: true }),
      supabase.from('alerts').select('id', { count: 'exact', head: true }).eq('alert_type', 'twap_pattern'),
      supabase.from('alerts').select('id', { count: 'exact', head: true }).eq('alert_type', 'suspect_trade'),
      supabase.from('alerts').select('*').order('id', { ascending: false }).limit(10),
      supabase.from('wallets').select('*').order('info_score', { ascending: false }).limit(5),
      supabase.from('alerts').select('alert_type, created_at').gte('created_at', since7d).limit(2000),
    ])

    setKpis({
      alerts24h: alerts24h.count ?? 0,
      walletsTracked: wallets.count ?? 0,
      twapDetected: twap.count ?? 0,
      suspectTrades: suspects.count ?? 0,
    })
    setRecent((recentRes.data as AlertRow[]) ?? [])
    setTopWallets((topRes.data as WalletRow[]) ?? [])
    setWeekAlerts((weekRes.data as AlertRow[]) ?? [])
  }

  useEffect(() => {
    void load()
    const channel = supabase
      .channel('alerts-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alerts' }, (payload) => {
        setRecent((prev) => [payload.new as AlertRow, ...prev].slice(0, 10))
        setKpis((prev) => ({ ...prev, alerts24h: prev.alerts24h + 1 }))
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [])

  const chartData = useMemo(() => {
    const days: Record<string, Record<string, number>> = {}
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 3600 * 1000)
      days[d.toISOString().slice(0, 10)] = {}
    }
    for (const alert of weekAlerts) {
      const day = alert.created_at.slice(0, 10)
      if (!(day in days)) continue
      days[day][alert.alert_type] = (days[day][alert.alert_type] ?? 0) + 1
    }
    return Object.entries(days).map(([day, counts]) => ({ day: day.slice(5), ...counts }))
  }, [weekAlerts])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-sentinel-border pb-2">
        <h2 className="text-sm font-bold font-heading text-sentinel-accent uppercase tracking-widest">SYS_DASHBOARD</h2>
        <span className="text-[10px] font-mono text-slate-500 animate-pulse">LIVE 🔴</span>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <KpiCard label="Alert (24h)" value={kpis.alerts24h} accent="#22C55E" />
        <KpiCard label="Wallets Tracked" value={kpis.walletsTracked} />
        <KpiCard label="TWAP Detected" value={kpis.twapDetected} accent="#22C55E" />
        <KpiCard label="Suspect Trade" value={kpis.suspectTrades} accent="#EF4444" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="border border-sentinel-border bg-sentinel-panel p-3">
          <h3 className="mb-3 border-b border-sentinel-border pb-2 text-[10px] uppercase font-mono tracking-widest text-slate-400">7-Day Alert Activity</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="#334155" vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="day" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} fontFamily="monospace" />
                <YAxis stroke="#64748b" fontSize={10} allowDecimals={false} tickLine={false} axisLine={false} fontFamily="monospace" />
                <Tooltip 
                  contentStyle={{ background: '#020617', border: '1px solid #334155', fontSize: '10px', fontFamily: 'monospace' }} 
                  itemStyle={{ padding: 0 }}
                />
                <Legend wrapperStyle={{ fontSize: '10px', fontFamily: 'monospace' }} />
                {Object.keys(ALERT_TYPE_LABELS).map((type) => (
                  <Bar key={type} dataKey={type} stackId="a" name={ALERT_TYPE_LABELS[type]} fill={ALERT_TYPE_COLORS[type] === '#38bdf8' ? '#22C55E' : ALERT_TYPE_COLORS[type]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="border border-sentinel-border bg-sentinel-panel flex flex-col">
          <h3 className="border-b border-sentinel-border p-3 pb-2 text-[10px] uppercase font-mono tracking-widest text-slate-400">Top Wallets [INFO_SCORE]</h3>
          <div className="flex-1 overflow-auto p-3 pt-2">
            {topWallets.length === 0 && <p className="text-[10px] font-mono text-slate-500">NO DATA</p>}
            <ul className="space-y-1">
              {topWallets.map((w) => (
                <li key={w.address} className="flex items-center justify-between bg-sentinel-bg px-2 py-1.5 text-xs hover:bg-sentinel-border/50 border border-transparent hover:border-sentinel-border transition-colors">
                  <Link to={`/wallet/${w.address}`} className="font-mono text-sentinel-accent hover:underline text-[10px]">
                    {shortAddress(w.address)}
                  </Link>
                  <span className="text-slate-400 font-mono text-[10px] text-right">
                    SCORE:<b className="text-slate-200 ml-1">{w.info_score.toFixed(1)}</b> <span className="text-slate-600 mx-1">|</span> {w.trades_count} TX
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="border border-sentinel-border bg-sentinel-panel">
        <h3 className="border-b border-sentinel-border p-3 pb-2 text-[10px] uppercase font-mono tracking-widest text-slate-400">Live Activity Feed</h3>
        {recent.length === 0 && <p className="p-3 text-[10px] font-mono text-slate-500">AWAITING EVENTS...</p>}
        <ul className="max-h-64 overflow-y-auto">
          {recent.map((a) => (
            <li key={`${a.source_table}-${a.source_rowid}`} className="flex items-center gap-2 border-b border-sentinel-border/50 px-3 py-1.5 hover:bg-sentinel-border/30 transition-colors">
              <span className="shrink-0 text-[10px] font-mono text-slate-500 w-12 text-right">{formatTs(a.timestamp_ms).split(' ')[1] ?? formatTs(a.timestamp_ms)}</span>
              <span
                className="shrink-0 border px-1 py-0.5 text-[9px] font-mono font-bold uppercase w-20 text-center"
                style={{ 
                  borderColor: ALERT_TYPE_COLORS[a.alert_type] === '#38bdf8' ? '#22C55E' : ALERT_TYPE_COLORS[a.alert_type] ?? '#64748b', 
                  color: ALERT_TYPE_COLORS[a.alert_type] === '#38bdf8' ? '#22C55E' : ALERT_TYPE_COLORS[a.alert_type] ?? '#94a3b8' 
                }}
              >
                {ALERT_TYPE_LABELS[a.alert_type] ?? a.alert_type}
              </span>
              <span className="shrink-0 font-mono text-sentinel-accent text-[10px] w-24">{shortAddress(a.wallet_address)}</span>
              <span className="min-w-0 flex-1 truncate text-slate-300 font-mono text-[10px]">{a.market_title ?? a.asset_id ?? 'UNKNOWN_ASSET'}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
