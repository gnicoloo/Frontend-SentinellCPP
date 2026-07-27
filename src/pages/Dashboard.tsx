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
    <div className="rounded-lg border border-sentinel-border bg-sentinel-panel p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold" style={{ color: accent ?? '#e2e8f0' }}>
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
    // Realtime: ogni INSERT su alerts aggiorna feed e contatori.
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
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Dashboard</h2>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Alert (24h)" value={kpis.alerts24h} accent="#38bdf8" />
        <KpiCard label="Wallet tracciati" value={kpis.walletsTracked} />
        <KpiCard label="TWAP rilevati" value={kpis.twapDetected} accent="#38bdf8" />
        <KpiCard label="Suspect trade" value={kpis.suspectTrades} accent="#f87171" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-sentinel-border bg-sentinel-panel p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-400">Alert per tipo — ultimi 7 giorni</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid stroke="#1e2a44" vertical={false} />
                <XAxis dataKey="day" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#111a2c', border: '1px solid #1e2a44' }} />
                <Legend />
                {Object.keys(ALERT_TYPE_LABELS).map((type) => (
                  <Bar key={type} dataKey={type} stackId="a" name={ALERT_TYPE_LABELS[type]} fill={ALERT_TYPE_COLORS[type]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border border-sentinel-border bg-sentinel-panel p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-400">Top 5 wallet per info score</h3>
          {topWallets.length === 0 && <p className="text-sm text-slate-500">Nessun wallet sincronizzato.</p>}
          <ul className="space-y-2">
            {topWallets.map((w) => (
              <li key={w.address} className="flex items-center justify-between rounded bg-white/5 px-3 py-2 text-sm">
                <Link to={`/wallet/${w.address}`} className="font-mono text-sentinel-accent hover:underline">
                  {shortAddress(w.address)}
                </Link>
                <span className="text-slate-400">
                  info <b className="text-slate-200">{w.info_score.toFixed(1)}</b> · {w.trades_count} trade
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded-lg border border-sentinel-border bg-sentinel-panel p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-400">Activity feed — ultimi alert</h3>
        {recent.length === 0 && <p className="text-sm text-slate-500">Nessun alert ancora.</p>}
        <ul className="max-h-80 space-y-1 overflow-y-auto">
          {recent.map((a) => (
            <li key={`${a.source_table}-${a.source_rowid}`} className="flex items-center gap-3 rounded px-3 py-2 text-sm hover:bg-white/5">
              <span
                className="rounded px-2 py-0.5 text-xs font-semibold"
                style={{ background: `${ALERT_TYPE_COLORS[a.alert_type] ?? '#64748b'}22`, color: ALERT_TYPE_COLORS[a.alert_type] ?? '#94a3b8' }}
              >
                {ALERT_TYPE_LABELS[a.alert_type] ?? a.alert_type}
              </span>
              <span className="font-mono text-slate-300">{shortAddress(a.wallet_address)}</span>
              <span className="min-w-0 flex-1 truncate text-slate-500">{a.market_title ?? a.asset_id ?? ''}</span>
              <span className="shrink-0 text-xs text-slate-500">{formatTs(a.timestamp_ms)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
