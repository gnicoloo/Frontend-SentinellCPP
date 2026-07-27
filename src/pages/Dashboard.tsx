import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useRange } from '../context/RangeProvider'
import { bucketize } from '../lib/range'
import {
  ALERT_TYPE_ORDER, alertColor, alertLabel, outcomeColor, shortAddress,
  type AlertRow, type AlertTradeRow, type PositionRow, type WalletRow,
} from '../lib/types'
import { ACCENT, SERIES, STATUS } from '../lib/theme'
import { ago, changeRatio, compact, percentileOf, usd } from '../lib/format'
import FilterBar from '../components/FilterBar'
import SyncStatus from '../components/SyncStatus'
import Panel from '../components/viz/Panel'
import StatTile from '../components/viz/StatTile'
import ActivityChart from '../components/viz/ActivityChart'
import Legend from '../components/viz/Legend'
import Sparkline from '../components/viz/Sparkline'
import MiniBar from '../components/viz/MiniBar'
import Signed from '../components/viz/Signed'

const ROW_CAP = 6000

type FlowRow = Pick<AlertRow, 'alert_type' | 'wallet_address' | 'asset_id' | 'market_title' | 'timestamp_ms'>

const SEVERE = new Set(['suspect_trade', 'deception_alert'])

export default function Dashboard() {
  const { def, key, nonce, start, end, prevStart } = useRange()
  const [rows, setRows] = useState<FlowRow[]>([])
  const [wallets, setWallets] = useState<WalletRow[]>([])
  const [tape, setTape] = useState<AlertTradeRow[]>([])
  const [positions, setPositions] = useState<PositionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [truncated, setTruncated] = useState(false)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const flashRef = useRef<Set<number>>(new Set())

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      // One pull covering the current window AND the prior one of equal length,
      // so every delta on this page is computed off the same rows as the chart.
      const [flowRes, walletRes, tapeRes, posRes] = await Promise.all([
        supabase
          .from('alerts')
          .select('alert_type, wallet_address, asset_id, market_title, timestamp_ms')
          .gte('timestamp_ms', prevStart)
          .lte('timestamp_ms', end)
          .order('timestamp_ms', { ascending: false })
          .limit(ROW_CAP),
        supabase.from('wallets').select('*').order('info_score', { ascending: false }).limit(500),
        supabase.from('alert_trades').select('*').order('id', { ascending: false }).limit(20),
        // The book is a live snapshot, so it is deliberately not time-scoped:
        // "capital at risk right now" has no 24h version.
        supabase.from('positions').select('*').order('notional_usd', { ascending: false }).limit(1000),
      ])
      if (cancelled) return
      const flow = (flowRes.data as FlowRow[]) ?? []
      setRows(flow)
      setTruncated(flow.length >= ROW_CAP)
      setWallets((walletRes.data as WalletRow[]) ?? [])
      setTape((tapeRes.data as AlertTradeRow[]) ?? [])
      setPositions((posRes.data as PositionRow[]) ?? [])
      setLoading(false)
    }
    void load()
    return () => { cancelled = true }
  }, [key, nonce, prevStart, end])

  // Live tape: new inserts land at the top and flash once.
  useEffect(() => {
    const channel = supabase
      .channel('dashboard-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alerts' }, (payload) => {
        const row = payload.new as AlertRow
        setRows((prev) => [{
          alert_type: row.alert_type,
          wallet_address: row.wallet_address,
          asset_id: row.asset_id,
          market_title: row.market_title,
          timestamp_ms: row.timestamp_ms,
        }, ...prev])
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alert_trades' }, (payload) => {
        const row = payload.new as AlertTradeRow
        flashRef.current.add(row.id)
        setTape((prev) => [row, ...prev].slice(0, 20))
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [])

  const current = useMemo(
    () => rows.filter((r) => r.timestamp_ms !== null && r.timestamp_ms >= start && r.timestamp_ms <= end),
    [rows, start, end],
  )
  const previous = useMemo(
    () => rows.filter((r) => r.timestamp_ms !== null && r.timestamp_ms >= prevStart && r.timestamp_ms < start),
    [rows, prevStart, start],
  )

  const buckets = useMemo(
    () => bucketize(current, (r) => r.timestamp_ms, (r) => r.alert_type, def, start, end),
    [current, def, start, end],
  )

  const kpis = useMemo(() => {
    const distinct = (list: FlowRow[], pick: (r: FlowRow) => string | null) =>
      new Set(list.map(pick).filter((v): v is string => !!v)).size
    const severe = (list: FlowRow[]) => list.filter((r) => SEVERE.has(r.alert_type)).length
    const marketKey = (r: FlowRow) => r.market_title ?? r.asset_id
    return {
      flow: [current.length, previous.length],
      severe: [severe(current), severe(previous)],
      actors: [distinct(current, (r) => r.wallet_address), distinct(previous, (r) => r.wallet_address)],
      markets: [distinct(current, marketKey), distinct(previous, marketKey)],
      peak: Math.max(0, ...buckets.map((b) => b.total)),
    }
  }, [current, previous, buckets])

  const totalTrend = useMemo(() => buckets.map((b) => b.total), [buckets])
  const severeTrend = useMemo(
    () => buckets.map((b) => [...SEVERE].reduce((s, t) => s + ((b[t] as number) ?? 0), 0)),
    [buckets],
  )

  // Market heat: which books are absorbing the flow, and what kind of flow.
  const markets = useMemo(() => {
    const map = new Map<string, { name: string; total: number; types: Map<string, number>; wallets: Set<string>; series: number[] }>()
    for (const r of current) {
      const name = r.market_title ?? r.asset_id
      if (!name) continue
      if (!map.has(name)) map.set(name, { name, total: 0, types: new Map(), wallets: new Set(), series: [] })
      const m = map.get(name)!
      m.total += 1
      m.types.set(r.alert_type, (m.types.get(r.alert_type) ?? 0) + 1)
      if (r.wallet_address) m.wallets.add(r.wallet_address)
    }
    const top = [...map.values()].sort((a, b) => b.total - a.total).slice(0, 8)
    for (const m of top) {
      const rowsOfMarket = current.filter((r) => (r.market_title ?? r.asset_id) === m.name)
      m.series = bucketize(rowsOfMarket, (r) => r.timestamp_ms, () => 'v', def, start, end).map((b) => b.total)
    }
    const max = top[0]?.total ?? 1
    return top.map((m) => {
      const dominant = [...m.types.entries()].sort((a, b) => b[1] - a[1])[0]
      return { ...m, share: m.total / max, dominant: dominant?.[0] ?? '', wallets: m.wallets.size }
    })
  }, [current, def, start, end])

  // Top actors: ranked by alert flow in the window, not by a static score.
  const actors = useMemo(() => {
    const byWallet = new Map<string, number>()
    for (const r of current) {
      if (!r.wallet_address) continue
      byWallet.set(r.wallet_address, (byWallet.get(r.wallet_address) ?? 0) + 1)
    }
    const infoPop = [...wallets].map((w) => w.info_score).sort((a, b) => a - b)
    const walletById = new Map(wallets.map((w) => [w.address, w]))
    const top = [...byWallet.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
    const max = top[0]?.[1] ?? 1
    return top.map(([address, count]) => {
      const w = walletById.get(address)
      const series = bucketize(
        current.filter((r) => r.wallet_address === address), (r) => r.timestamp_ms, () => 'v', def, start, end,
      ).map((b) => b.total)
      return {
        address,
        count,
        share: count / max,
        info: w?.info_score ?? null,
        pctl: w ? percentileOf(w.info_score, infoPop) : null,
        volume: w?.total_volume ?? null,
        label: w?.label ?? null,
        series,
      }
    })
  }, [current, wallets, def, start, end])

  // Capital at risk, by market. Alert flow says where the noise is; this says
  // where the money is -- the two do not always point at the same book.
  const exposure = useMemo(() => {
    const byMarket = new Map<string, {
      name: string; notional: number; unrealized: number
      wallets: Set<string>; outcomes: Map<string, number>
    }>()
    for (const p of positions) {
      const name = p.market_title ?? p.asset_id
      if (!byMarket.has(name)) {
        byMarket.set(name, { name, notional: 0, unrealized: 0, wallets: new Set(), outcomes: new Map() })
      }
      const m = byMarket.get(name)!
      m.notional += p.notional_usd
      m.unrealized += p.unrealized_pnl
      m.wallets.add(p.wallet_address)
      if (p.outcome) m.outcomes.set(p.outcome, (m.outcomes.get(p.outcome) ?? 0) + p.notional_usd)
    }
    const top = [...byMarket.values()].sort((a, b) => b.notional - a.notional).slice(0, 8)
    const max = top[0]?.notional ?? 1
    return {
      top: top.map((m) => ({
        ...m,
        share: m.notional / max,
        wallets: m.wallets.size,
        dominant: [...m.outcomes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      })),
      totalNotional: positions.reduce((s, p) => s + p.notional_usd, 0),
      totalUnrealized: positions.reduce((s, p) => s + p.unrealized_pnl, 0),
      openLegs: positions.filter((p) => p.net_contracts !== 0).length,
      wallets: new Set(positions.map((p) => p.wallet_address)).size,
    }
  }, [positions])

  const legendItems = ALERT_TYPE_ORDER.map((t) => ({ key: t, label: alertLabel(t), color: alertColor(t) }))
  const toggle = (k: string) =>
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })

  return (
    <div>
      <FilterBar
        title="MARKET SURVEILLANCE"
        right={<SyncStatus />}
      />

      <div className="space-y-3">
        {truncated && (
          <p className="border-l-2 px-3 py-1.5 text-[10px] font-mono uppercase text-slate-400" style={{ borderColor: STATUS.warning }}>
            ⚠ row cap reached ({compact(ROW_CAP)}) — narrow the range for exact figures
          </p>
        )}

        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
          <StatTile
            label="Alert flow" accent={SERIES[0]} value={compact(kpis.flow[0])}
            delta={changeRatio(kpis.flow[0], kpis.flow[1])} inverted
            trend={totalTrend} footnote={`vs prior ${def.label}`}
          />
          <StatTile
            label="Severe flow" accent={SERIES[1]} value={compact(kpis.severe[0])}
            delta={changeRatio(kpis.severe[0], kpis.severe[1])} inverted
            trend={severeTrend} footnote="suspect + deception"
          />
          <StatTile
            label="Active wallets" accent={SERIES[2]} value={compact(kpis.actors[0])}
            delta={changeRatio(kpis.actors[0], kpis.actors[1])}
            footnote={`vs prior ${def.label}`}
          />
          <StatTile
            label="Markets touched" accent={SERIES[3]} value={compact(kpis.markets[0])}
            delta={changeRatio(kpis.markets[0], kpis.markets[1])}
            footnote={`vs prior ${def.label}`}
          />
          <StatTile
            label="Peak intensity" accent={SERIES[5]} value={compact(kpis.peak)}
            footnote={`max alerts / ${def.label === '30D' ? 'day' : 'bucket'}`}
          />
        </div>

        {/* Exposure is a live snapshot, so it carries no period delta -- these
            tiles deliberately show no "vs prior" the way the flow tiles do. */}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <StatTile
            label="Capital at risk" accent={SERIES[4]} value={usd(exposure.totalNotional)}
            footnote={`${compact(exposure.openLegs)} open legs · live`}
          />
          <StatTile
            label="Unrealized P&L" accent={SERIES[1]} value={usd(exposure.totalUnrealized)}
            footnote={exposure.totalUnrealized >= 0 ? '▲ book in profit' : '▼ book in loss'}
          />
          <StatTile
            label="Wallets with a book" accent={SERIES[2]} value={compact(exposure.wallets)}
            footnote="holding open exposure"
          />
          <StatTile
            label="Books at risk" accent={SERIES[3]} value={compact(exposure.top.length ? new Set(positions.map((p) => p.condition_id ?? p.asset_id)).size : 0)}
            footnote="distinct outcome tokens"
          />
        </div>

        <div className="grid gap-3 xl:grid-cols-3">
          <Panel
            className="xl:col-span-2"
            title="Alert flow by type"
            meta={`${def.label} · ${compact(current.length)} events`}
            loading={loading}
            table={{
              columns: ['Time', ...ALERT_TYPE_ORDER.map(alertLabel), 'Total'],
              rows: buckets.map((b) => [
                def.stamp(b.t),
                ...ALERT_TYPE_ORDER.map((t) => (b[t] as number) ?? 0),
                b.total,
              ]),
            }}
          >
            <div className="p-3">
              <ActivityChart
                data={buckets}
                series={legendItems}
                tick={def.tick}
                stamp={def.stamp}
                hidden={hidden}
                height={210}
                unit="alerts"
              />
              <div className="mt-2 border-t border-sentinel-border pt-2">
                <Legend items={legendItems} hidden={hidden} onToggle={toggle} />
              </div>
            </div>
          </Panel>

          <Panel
            title="Market heat"
            meta={`top ${markets.length} by flow`}
            loading={loading}
            table={{
              columns: ['Market', 'Alerts', 'Wallets', 'Dominant'],
              rows: markets.map((m) => [m.name, m.total, m.wallets, alertLabel(m.dominant)]),
            }}
          >
            <ul className="divide-y divide-sentinel-border/40">
              {markets.length === 0 && <li className="px-3 py-4 text-[10px] font-mono text-slate-600">NO FLOW IN WINDOW</li>}
              {markets.map((m) => (
                <li key={m.name} className="px-3 py-1.5">
                  <div className="flex items-baseline gap-2">
                    <span
                      className="mt-1 inline-block h-2 w-2 shrink-0 self-center"
                      style={{ background: alertColor(m.dominant) }}
                      title={alertLabel(m.dominant)}
                    />
                    <Link
                      to={`/alerts?market=${encodeURIComponent(m.name)}`}
                      className="min-w-0 flex-1 truncate text-[11px] text-slate-200 hover:text-sentinel-accent hover:underline"
                      title={m.name}
                    >
                      {m.name}
                    </Link>
                    <span className="num shrink-0 text-[11px] font-semibold text-slate-100">{compact(m.total)}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 pl-4">
                    <MiniBar value={m.share} color={alertColor(m.dominant)} width={72} />
                    <Sparkline values={m.series} color={alertColor(m.dominant)} width={64} height={14} label={`${m.name} flow`} />
                    <span className="ml-auto text-[9px] font-mono uppercase text-slate-600">
                      {m.wallets} wlt · {alertLabel(m.dominant)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <div className="grid gap-3 xl:grid-cols-3">
          <Panel
            title="Capital at risk"
            meta={`top ${exposure.top.length} books · live`}
            loading={loading}
            table={{
              columns: ['Market', 'Notional', 'Unrealized', 'Wallets', 'Dominant side'],
              rows: exposure.top.map((m) => [
                m.name, m.notional.toFixed(2), m.unrealized.toFixed(2), m.wallets, m.dominant ?? '—',
              ]),
            }}
          >
            <ul className="divide-y divide-sentinel-border/40">
              {exposure.top.length === 0 && (
                <li className="px-3 py-4 font-mono text-[10px] uppercase text-slate-600">
                  no exposure synced
                </li>
              )}
              {exposure.top.map((m) => (
                <li key={m.name} className="px-3 py-1.5">
                  <div className="flex items-baseline gap-2">
                    <span
                      className="inline-block h-2 w-2 shrink-0 self-center"
                      style={{ background: outcomeColor(m.dominant) }}
                      title={m.dominant ?? 'unknown side'}
                    />
                    <Link
                      to={`/alerts?market=${encodeURIComponent(m.name)}`}
                      className="min-w-0 flex-1 truncate text-[11px] text-slate-200 hover:text-sentinel-accent hover:underline"
                      title={m.name}
                    >
                      {m.name}
                    </Link>
                    <span className="num shrink-0 text-[11px] font-semibold text-slate-100">{usd(m.notional)}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 pl-4">
                    <MiniBar value={m.share} color={outcomeColor(m.dominant)} width={72} />
                    <Signed className="num text-[10px]" value={m.unrealized} format={usd} />
                    <span className="ml-auto font-mono text-[9px] uppercase text-slate-600">
                      {m.wallets} wlt · {m.dominant ?? 'n/a'}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel
            className="xl:col-span-2"
            title="Top actors"
            meta={`ranked by flow in ${def.label}`}
            loading={loading}
            table={{
              columns: ['Wallet', 'Alerts', 'Info score', 'Pctl', 'Volume'],
              rows: actors.map((a) => [
                a.address, a.count,
                a.info?.toFixed(1) ?? '—',
                a.pctl !== null ? `${Math.round(a.pctl * 100)}` : '—',
                usd(a.volume),
              ]),
            }}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="text-left text-[9px] font-mono uppercase tracking-wider text-slate-600">
                  <tr className="border-b border-sentinel-border">
                    <th className="px-3 py-1.5 font-normal">Wallet</th>
                    <th className="px-3 py-1.5 font-normal">Flow ({def.label})</th>
                    <th className="px-3 py-1.5 font-normal">Shape</th>
                    <th className="px-3 py-1.5 text-right font-normal">Info</th>
                    <th className="hidden px-3 py-1.5 text-right font-normal sm:table-cell">Volume</th>
                  </tr>
                </thead>
                <tbody>
                  {actors.length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-4 text-center font-mono text-[10px] text-slate-600">NO ACTORS IN WINDOW</td></tr>
                  )}
                  {actors.map((a) => (
                    <tr key={a.address} className="border-b border-sentinel-border/40 hover:bg-white/[0.03]">
                      <td className="px-3 py-1.5">
                        <Link to={`/wallet/${a.address}`} className="font-mono text-sentinel-accent hover:underline">
                          {shortAddress(a.address)}
                        </Link>
                        {a.label && (
                          <span className="ml-2 border px-1 text-[9px] font-mono uppercase" style={{ borderColor: STATUS.critical, color: STATUS.critical }}>
                            {a.label}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        <span className="flex items-center gap-2">
                          <MiniBar value={a.share} color={SERIES[0]} />
                          <span className="num text-slate-100">{a.count}</span>
                        </span>
                      </td>
                      <td className="px-3 py-1.5">
                        <Sparkline values={a.series} color={SERIES[0]} width={72} height={16} label={`${a.address} flow`} />
                      </td>
                      <td className="num px-3 py-1.5 text-right">
                        <span className="text-slate-100">{a.info?.toFixed(1) ?? '—'}</span>
                        {a.pctl !== null && (
                          <span className="ml-1 text-[9px] text-slate-600">p{Math.round(a.pctl * 100)}</span>
                        )}
                      </td>
                      <td className="num hidden px-3 py-1.5 text-right text-slate-400 sm:table-cell">{usd(a.volume)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <div className="grid gap-3">
          <Panel title="Live tape" meta="unfiltered · newest first" actions={
            <Link to="/alerts" className="text-[9px] font-mono uppercase tracking-wider text-slate-500 hover:text-sentinel-accent">
              explorer »
            </Link>
          }>
            <ul className="max-h-[280px] divide-y divide-sentinel-border/40 overflow-y-auto">
              {tape.length === 0 && <li className="px-3 py-4 text-[10px] font-mono text-slate-600">AWAITING EVENTS…</li>}
              {tape.map((a) => {
                const isBuy = a.side.toUpperCase().startsWith('B')
                return (
                  <li
                    key={a.id}
                    className={`flex items-center gap-2 px-3 py-1.5 ${flashRef.current.has(a.id) ? 'tape-flash' : ''}`}
                  >
                    <span
                      className="w-12 shrink-0 truncate border-l-2 pl-1.5 text-[9px] font-mono font-bold uppercase"
                      style={{ borderColor: isBuy ? STATUS.good : STATUS.critical, color: isBuy ? STATUS.good : STATUS.critical }}
                      title={a.side}
                    >
                      {isBuy ? 'BUY' : 'SELL'}
                    </span>
                    {a.wallet_address ? (
                      <Link to={`/wallet/${a.wallet_address}`} className="shrink-0 font-mono text-[10px] text-sentinel-accent hover:underline">
                        {shortAddress(a.wallet_address)}
                      </Link>
                    ) : (
                      <span className="shrink-0 font-mono text-[10px] text-slate-600">—</span>
                    )}
                    <span className="num min-w-0 flex-1 truncate text-[10px] text-slate-300" title={a.market_title ?? undefined}>
                      {compact(a.size)} <span className="text-slate-500">@</span> {a.price.toFixed(3)} <span className="text-slate-600">·</span> {a.market_title ?? a.asset_id ?? 'unknown asset'}
                    </span>
                    <span className="num w-8 shrink-0 text-right text-[10px] text-slate-600">{ago(a.timestamp_ms)}</span>
                  </li>
                )
              })}
            </ul>
          </Panel>
        </div>

        <p className="pb-2 text-[9px] font-mono uppercase tracking-wider text-slate-700">
          press <span style={{ color: ACCENT }}>ctrl+k</span> for the command line · [TBL] on any panel opens its data table
        </p>
      </div>
    </div>
  )
}
