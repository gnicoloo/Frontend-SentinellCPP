import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip,
} from 'recharts'
import { supabase } from '../lib/supabaseClient'
import { useRange } from '../context/RangeProvider'
import { bucketize } from '../lib/range'
import {
  ALERT_TYPE_ORDER, alertColor, alertLabel, formatTs, shortAddress,
  type AlertRow, type WalletRow,
} from '../lib/types'
import { INK, SERIES, STATUS, severityOf } from '../lib/theme'
import { ago, compact, ordinal, percentileOf, pct, usd } from '../lib/format'
import { median } from '../lib/stats'
import FilterBar from '../components/FilterBar'
import Panel from '../components/viz/Panel'
import StatTile from '../components/viz/StatTile'
import ScoreMeter from '../components/viz/ScoreMeter'
import ActivityChart from '../components/viz/ActivityChart'
import Legend from '../components/viz/Legend'
import MiniBar from '../components/viz/MiniBar'

const SUB_SCORES = [
  { key: 'winrate_score', label: 'WINRATE' },
  { key: 'streak_score', label: 'STREAK' },
  { key: 'volume_score', label: 'VOLUME' },
  { key: 'profit_score', label: 'PROFIT' },
  { key: 'markets_score', label: 'MARKETS' },
  { key: 'timing_score', label: 'TIMING' },
  { key: 'event_score', label: 'EVENTS' },
  { key: 'cluster_score', label: 'CLUSTER' },
]

interface SuspectMove {
  id: number
  asset_id: string | null
  market_title: string | null
  price: number | null
  size: number | null
  side: string | null
  roi_estimate: number | null
  deception_flags: string | null
  timestamp_ms: number | null
  market_url: string | null
}

interface DeceptionRow {
  deception_score: number
  roi_discrepancy_score: number | null
  loss_cluster_score: number | null
  asymmetry_score: number | null
}

export default function WalletDetail() {
  const { address = '' } = useParams()
  const { def, key: rangeKey, nonce, start, end } = useRange()

  const [wallet, setWallet] = useState<WalletRow | null>(null)
  const [peers, setPeers] = useState<WalletRow[]>([])
  const [alerts, setAlerts] = useState<AlertRow[]>([])
  const [moves, setMoves] = useState<SuspectMove[]>([])
  const [deception, setDeception] = useState<DeceptionRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      const [walletRes, peerRes, alertRes, moveRes, decRes] = await Promise.all([
        supabase.from('wallets').select('*').eq('address', address).maybeSingle(),
        supabase.from('wallets').select('*').order('info_score', { ascending: false }).limit(500),
        supabase.from('alerts').select('*').eq('wallet_address', address).order('timestamp_ms', { ascending: false }).limit(500),
        supabase.from('suspect_moves').select('*').eq('wallet_address', address).order('timestamp_ms', { ascending: false }).limit(100),
        supabase
          .from('deception_alerts')
          .select('deception_score, roi_discrepancy_score, loss_cluster_score, asymmetry_score')
          .eq('wallet_address', address)
          .order('id', { ascending: false })
          .limit(1),
      ])
      if (cancelled) return
      setWallet((walletRes.data as WalletRow) ?? null)
      setNotFound(!walletRes.data)
      setPeers((peerRes.data as WalletRow[]) ?? [])
      setAlerts((alertRes.data as AlertRow[]) ?? [])
      setMoves((moveRes.data as SuspectMove[]) ?? [])
      const d = decRes.data as DeceptionRow[] | null
      setDeception(d && d.length > 0 ? d[0] : null)
      setLoading(false)
    }
    void load()
    return () => { cancelled = true }
  }, [address, rangeKey, nonce])

  const windowAlerts = useMemo(
    () => alerts.filter((a) => a.timestamp_ms !== null && a.timestamp_ms >= start && a.timestamp_ms <= end),
    [alerts, start, end],
  )
  const buckets = useMemo(
    () => bucketize(windowAlerts, (a) => a.timestamp_ms, (a) => a.alert_type, def, start, end),
    [windowAlerts, def, start, end],
  )

  // Peer population -- every score on this page is shown against it.
  const pop = useMemo(() => {
    const asc = (pick: (w: WalletRow) => number) => peers.map(pick).sort((a, b) => a - b)
    return {
      info: asc((w) => w.info_score),
      susp: asc((w) => w.suspicious_score),
      forensic: asc((w) => w.forensic_score),
      roi: asc((w) => w.roi_estimate),
      volume: asc((w) => w.total_volume),
      medianInfo: median(peers.map((w) => w.info_score)),
      medianSusp: median(peers.map((w) => w.suspicious_score)),
      medianForensic: median(peers.map((w) => w.forensic_score)),
    }
  }, [peers])

  const profile = (wallet?.profile ?? {}) as Record<string, number>
  const radarData = useMemo(
    () => SUB_SCORES.map((s) => ({
      subject: s.label,
      wallet: Math.round(((profile[s.key] ?? 0) as number) * 100) / 100,
      peer: Math.round(median(peers.map((w) => ((w.profile ?? {}) as Record<string, number>)[s.key] ?? 0)) * 100) / 100,
    })),
    [profile, peers],
  )

  const winRate = wallet && wallet.trades_count > 0 ? wallet.win_count / wallet.trades_count : 0
  const threat = wallet ? Math.min(1, wallet.suspicious_score / 10) : 0
  const sev = severityOf(threat)

  // Which books this wallet actually shows up in.
  const exposure = useMemo(() => {
    const map = new Map<string, { name: string; count: number; types: Set<string> }>()
    for (const a of alerts) {
      const name = a.market_title ?? a.asset_id
      if (!name) continue
      if (!map.has(name)) map.set(name, { name, count: 0, types: new Set() })
      const m = map.get(name)!
      m.count += 1
      m.types.add(a.alert_type)
    }
    const list = [...map.values()].sort((a, b) => b.count - a.count).slice(0, 8)
    const max = list[0]?.count ?? 1
    return list.map((m) => ({ ...m, share: m.count / max, types: [...m.types] }))
  }, [alerts])

  const legendItems = ALERT_TYPE_ORDER.map((t) => ({ key: t, label: alertLabel(t), color: alertColor(t) }))
  const toggle = (k: string) =>
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })

  const copy = () => {
    void navigator.clipboard.writeText(address).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    })
  }

  return (
    <div>
      <FilterBar
        title="WALLET FORENSICS"
        right={
          <a
            href={`https://polygonscan.com/address/${address}`}
            target="_blank"
            rel="noreferrer"
            className="border border-sentinel-accent/50 px-2 py-1 font-mono text-[10px] uppercase text-sentinel-accent hover:underline"
          >
            polygonscan »
          </a>
        }
      >
        <Link to="/wallets" className="font-mono text-[10px] uppercase text-slate-500 hover:text-slate-200">« screener</Link>
      </FilterBar>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border border-sentinel-border bg-sentinel-panel px-3 py-2">
          <button
            onClick={copy}
            title="Copy address"
            className="font-mono text-sm text-slate-100 hover:text-sentinel-accent"
          >
            {shortAddress(address)} <span className="text-[10px] text-slate-600">{copied ? '✓ copied' : '⧉'}</span>
          </button>
          {wallet?.label && (
            <span className="border px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase" style={{ borderColor: STATUS.critical, color: STATUS.critical }}>
              {wallet.label}
            </span>
          )}
          {wallet && (
            <>
              <span className="border px-1.5 py-0.5 font-mono text-[10px] uppercase" style={{ borderColor: sev.color, color: sev.color }}>
                ■ {sev.label}
              </span>
              <span className="font-mono text-[10px] uppercase text-slate-500">
                info rank {ordinal(percentileOf(wallet.info_score, pop.info) * 100)} of {peers.length}
              </span>
              <span className="ml-auto font-mono text-[10px] text-slate-600">
                first seen {formatTs(wallet.first_seen_ms)} · last {ago(wallet.last_seen_ms)} ago
              </span>
            </>
          )}
        </div>

        {notFound && (
          <p className="border-l-2 px-3 py-1.5 font-mono text-[10px] uppercase text-slate-400" style={{ borderColor: STATUS.warning }}>
            ⚠ wallet not in registry — showing related alerts only
          </p>
        )}

        {wallet && (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
            <StatTile
              label="Est. ROI" accent={SERIES[0]} value={pct(wallet.roi_estimate)}
              footnote={`${ordinal(percentileOf(wallet.roi_estimate, pop.roi) * 100)} pctl`}
            />
            <StatTile
              label="Win rate" accent={SERIES[2]} value={pct(winRate)}
              footnote={`${compact(wallet.win_count)} / ${compact(wallet.trades_count)} tx`}
            />
            <StatTile
              label="Total volume" accent={SERIES[3]} value={usd(wallet.total_volume)}
              footnote={`${ordinal(percentileOf(wallet.total_volume, pop.volume) * 100)} pctl`}
            />
            <StatTile
              label="Net P&L" accent={SERIES[1]} value={usd(wallet.total_profit)}
              footnote={wallet.total_profit >= 0 ? '▲ in profit' : '▼ in loss'}
            />
            <StatTile
              label={`Flow ${def.label}`} accent={SERIES[5]} value={compact(windowAlerts.length)}
              trend={buckets.map((b) => b.total)} footnote={`${compact(alerts.length)} lifetime`}
            />
            <StatTile
              label="Markets" accent={SERIES[4]} value={compact(exposure.length)}
              footnote="distinct books flagged"
            />
          </div>
        )}

        <div className="grid gap-3 xl:grid-cols-3">
          <Panel
            className="xl:col-span-2"
            title="Alert timeline"
            meta={`${def.label} · ${compact(windowAlerts.length)} events`}
            loading={loading}
            table={{
              columns: ['Time', ...ALERT_TYPE_ORDER.map(alertLabel), 'Total'],
              rows: buckets.map((b) => [def.stamp(b.t), ...ALERT_TYPE_ORDER.map((t) => (b[t] as number) ?? 0), b.total]),
            }}
          >
            <div className="p-3">
              <ActivityChart data={buckets} series={legendItems} tick={def.tick} stamp={def.stamp} hidden={hidden} height={180} unit="alerts" />
              <div className="mt-2 border-t border-sentinel-border pt-2">
                <Legend items={legendItems} hidden={hidden} onToggle={toggle} />
              </div>
            </div>
          </Panel>

          {wallet && (
            <Panel
              title="Threat scores"
              meta={`vs ${peers.length} peers`}
              loading={loading}
              table={{
                columns: ['Metric', 'Value', 'Peer median', 'Pctl'],
                rows: [
                  ['Suspicious', wallet.suspicious_score.toFixed(2), pop.medianSusp.toFixed(2), `${Math.round(percentileOf(wallet.suspicious_score, pop.susp) * 100)}`],
                  ['Info', wallet.info_score.toFixed(2), pop.medianInfo.toFixed(2), `${Math.round(percentileOf(wallet.info_score, pop.info) * 100)}`],
                  ['Forensic', wallet.forensic_score.toFixed(2), pop.medianForensic.toFixed(2), `${Math.round(percentileOf(wallet.forensic_score, pop.forensic) * 100)}`],
                  ...(deception ? [['Deception', deception.deception_score.toFixed(2), '—', '—']] : []),
                ],
              }}
            >
              <div className="space-y-3 p-3">
                <ScoreMeter label="Suspicious" value={wallet.suspicious_score} max={10} population={pop.susp} benchmark={pop.medianSusp} benchmarkLabel="peer median" />
                <ScoreMeter label="Info" value={wallet.info_score} max={100} population={pop.info} benchmark={pop.medianInfo} benchmarkLabel="peer median" />
                <ScoreMeter label="Forensic" value={wallet.forensic_score} max={10} population={pop.forensic} benchmark={pop.medianForensic} benchmarkLabel="peer median" />
                {deception && (
                  <>
                    <ScoreMeter label="Deception" value={deception.deception_score} max={1} />
                    <ul className="space-y-1 border-t border-sentinel-border pt-2 font-mono text-[10px] uppercase text-slate-500">
                      {([
                        ['roi discrepancy', deception.roi_discrepancy_score],
                        ['loss cluster', deception.loss_cluster_score],
                        ['asymmetry', deception.asymmetry_score],
                      ] as const).map(([label, v]) => (
                        <li key={label} className="flex items-center gap-2">
                          <span className="w-28 shrink-0">{label}</span>
                          <MiniBar value={Math.min(1, v ?? 0)} color={SERIES[4]} width={60} />
                          <span className="num ml-auto text-slate-300">{v?.toFixed(2) ?? '—'}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </Panel>
          )}
        </div>

        <div className="grid gap-3 xl:grid-cols-3">
          {wallet && (
            <Panel
              title="Behavioral vector"
              meta="wallet vs peer median"
              loading={loading}
              table={{
                columns: ['Axis', 'Wallet', 'Peer median'],
                rows: radarData.map((d) => [d.subject, d.wallet.toFixed(2), d.peer.toFixed(2)]),
              }}
            >
              <div className="p-3">
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData} outerRadius="72%">
                      <PolarGrid stroke={INK.grid} />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: INK.muted, fontSize: 9, fontFamily: 'monospace' }} />
                      <PolarRadiusAxis domain={[0, 1]} tick={false} axisLine={false} />
                      <Radar name="Peer median" dataKey="peer" stroke={INK.secondary} strokeWidth={2} fill={INK.secondary} fillOpacity={0.06} isAnimationActive={false} />
                      <Radar name="Wallet" dataKey="wallet" stroke={SERIES[0]} strokeWidth={2} fill={SERIES[0]} fillOpacity={0.1} isAnimationActive={false} />
                      <Tooltip
                        isAnimationActive={false}
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null
                          return (
                            <div className="border border-sentinel-border bg-sentinel-bg px-2 py-1.5 shadow-xl">
                              <p className="mb-1 font-mono text-[10px] uppercase text-slate-400">{String(label)}</p>
                              {payload.map((p) => (
                                <p key={String(p.dataKey)} className="flex items-baseline gap-2">
                                  <span className="inline-block h-0.5 w-3" style={{ background: p.color }} />
                                  <span className="num text-[11px] font-semibold text-slate-100">{Number(p.value).toFixed(2)}</span>
                                  <span className="font-mono text-[10px] text-slate-400">{p.name}</span>
                                </p>
                              ))}
                            </div>
                          )
                        }}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 border-t border-sentinel-border pt-2">
                  <Legend
                    mark="line"
                    items={[
                      { key: 'wallet', label: 'Wallet', color: SERIES[0] },
                      { key: 'peer', label: 'Peer median', color: INK.secondary },
                    ]}
                  />
                </div>
              </div>
            </Panel>
          )}

          <Panel
            title="Market exposure"
            meta={`top ${exposure.length} books`}
            loading={loading}
            table={{
              columns: ['Market', 'Alerts', 'Types'],
              rows: exposure.map((m) => [m.name, m.count, m.types.map(alertLabel).join(' / ')]),
            }}
          >
            <ul className="divide-y divide-sentinel-border/40">
              {exposure.length === 0 && <li className="px-3 py-4 font-mono text-[10px] uppercase text-slate-600">no market history</li>}
              {exposure.map((m) => (
                <li key={m.name} className="px-3 py-1.5">
                  <div className="flex items-baseline gap-2">
                    <Link
                      to={`/alerts?market=${encodeURIComponent(m.name)}`}
                      className="min-w-0 flex-1 truncate text-[11px] text-slate-200 hover:text-sentinel-accent hover:underline"
                      title={m.name}
                    >
                      {m.name}
                    </Link>
                    <span className="num shrink-0 text-[11px] font-semibold text-slate-100">{m.count}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <MiniBar value={m.share} color={alertColor(m.types[0])} width={72} />
                    <span className="flex gap-1">
                      {m.types.map((t) => (
                        <span key={t} className="inline-block h-1.5 w-1.5" style={{ background: alertColor(t) }} title={alertLabel(t)} />
                      ))}
                    </span>
                    <span className="ml-auto font-mono text-[9px] uppercase text-slate-600">
                      {m.types.map(alertLabel).join(' · ')}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Trade blotter" meta={`${moves.length} flagged fills`} loading={loading}>
            <div className="max-h-[300px] overflow-auto">
              <table className="w-full whitespace-nowrap text-[10px]">
                <thead className="sticky top-0 border-b border-sentinel-border bg-sentinel-panel text-left font-mono text-[9px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-2 py-1.5 font-normal">Side</th>
                    <th className="px-2 py-1.5 text-right font-normal">Size</th>
                    <th className="px-2 py-1.5 text-right font-normal">Price</th>
                    <th className="px-2 py-1.5 text-right font-normal">ROI</th>
                    <th className="px-2 py-1.5 text-right font-normal">When</th>
                  </tr>
                </thead>
                <tbody>
                  {moves.length === 0 && (
                    <tr><td colSpan={5} className="px-2 py-4 text-center font-mono uppercase text-slate-600">no flagged fills</td></tr>
                  )}
                  {moves.map((m) => {
                    const buy = (m.side ?? '').toUpperCase().startsWith('B')
                    return (
                      <tr key={m.id} className="border-b border-sentinel-border/40 hover:bg-white/[0.03]" title={m.market_title ?? ''}>
                        <td className="px-2 py-1 font-mono" style={{ color: buy ? STATUS.good : STATUS.critical }}>
                          {buy ? '▲ BUY' : '▼ SELL'}
                        </td>
                        <td className="num px-2 py-1 text-right text-slate-200">{compact(m.size ?? 0)}</td>
                        <td className="num px-2 py-1 text-right text-slate-400">{m.price?.toFixed(3) ?? '—'}</td>
                        <td className="num px-2 py-1 text-right" style={{ color: (m.roi_estimate ?? 0) >= 0 ? STATUS.good : STATUS.critical }}>
                          {m.roi_estimate !== null ? pct(m.roi_estimate) : '—'}
                        </td>
                        <td className="num px-2 py-1 text-right text-slate-600">{ago(m.timestamp_ms)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <Panel
          title="Alert log"
          meta={`${compact(alerts.length)} records · lifetime`}
          loading={loading}
          actions={
            <Link to="/clusters" className="font-mono text-[9px] uppercase tracking-wider text-slate-500 hover:text-sentinel-accent">
              cluster graph »
            </Link>
          }
          table={{
            columns: ['Type', 'Market', 'Timestamp'],
            rows: alerts.slice(0, 200).map((a) => [alertLabel(a.alert_type), a.market_title ?? a.asset_id ?? '—', formatTs(a.timestamp_ms)]),
          }}
        >
          <ul className="max-h-72 divide-y divide-sentinel-border/40 overflow-y-auto">
            {alerts.length === 0 && <li className="px-3 py-4 font-mono text-[10px] uppercase text-slate-600">no events logged</li>}
            {alerts.map((a) => (
              <li key={`${a.source_table}-${a.source_rowid}`} className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/[0.03]">
                <span
                  className="w-20 shrink-0 truncate border-l-2 pl-1.5 font-mono text-[9px] uppercase text-slate-400"
                  style={{ borderColor: alertColor(a.alert_type) }}
                >
                  {alertLabel(a.alert_type)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[10px] text-slate-300">{a.market_title ?? a.asset_id ?? 'unknown market'}</span>
                <span className="num shrink-0 text-[10px] text-slate-600">{formatTs(a.timestamp_ms)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  )
}
