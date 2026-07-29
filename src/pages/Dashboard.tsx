import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useRange } from '../context/RangeProvider'
import type { Bucket } from '../lib/range'
import {
  ALERT_TYPE_ORDER, alertColor, alertLabel, outcomeColor, shortAddress,
  type AlertTradeRow, type WalletRow,
} from '../lib/types'
import {
  alertBuckets, alertEntitySeries, alertTopEntities, alertWindowStats,
  positionTopMarkets, positionTotals,
  type ExposureMarket, type PositionTotals, type TopEntity, type WindowStats,
} from '../lib/aggregates'
import { ACCENT, SERIES, STATUS } from '../lib/theme'
import { ago, changeRatio, compact, percentileOf, usd } from '../lib/format'
import FilterBar from '../components/FilterBar'
import SyncStatus from '../components/SyncStatus'
import LoadError from '../components/LoadError'
import Panel from '../components/viz/Panel'
import StatTile from '../components/viz/StatTile'
import ActivityChart from '../components/viz/ActivityChart'
import Legend from '../components/viz/Legend'
import Sparkline from '../components/viz/Sparkline'
import MiniBar from '../components/viz/MiniBar'
import Signed from '../components/viz/Signed'

const SEVERE = ['suspect_trade', 'deception_alert']

/** A busy feed must not turn every insert into a refetch of the aggregates. */
const LIVE_THROTTLE_MS = 15_000

const EMPTY_STATS: WindowStats = { total: 0, severe: 0, wallets: 0, markets: 0 }
const EMPTY_BOOK: PositionTotals = { notional: 0, unrealized: 0, openLegs: 0, wallets: 0, tokens: 0 }

export default function Dashboard() {
  const { def, key, nonce, start, end, prevStart } = useRange()

  const [buckets, setBuckets] = useState<Bucket[]>([])
  const [curr, setCurr] = useState<WindowStats>(EMPTY_STATS)
  const [prev, setPrev] = useState<WindowStats>(EMPTY_STATS)
  const [topMarkets, setTopMarkets] = useState<TopEntity[]>([])
  const [marketSeries, setMarketSeries] = useState<Map<string, number[]>>(new Map())
  const [topActors, setTopActors] = useState<TopEntity[]>([])
  const [actorSeries, setActorSeries] = useState<Map<string, number[]>>(new Map())
  const [actorWallets, setActorWallets] = useState<WalletRow[]>([])
  const [infoPop, setInfoPop] = useState<number[]>([])
  const [book, setBook] = useState<PositionTotals>(EMPTY_BOOK)
  const [exposure, setExposure] = useState<ExposureMarket[]>([])
  const [tape, setTape] = useState<AlertTradeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const flashRef = useRef<Set<number>>(new Set())

  // Live inserts nudge the aggregates, throttled -- the tape below is what
  // actually streams; the histogram only needs to not drift for a minute.
  const [liveNonce, setLiveNonce] = useState(0)
  const lastLiveRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        // Everything below is aggregated in Postgres, so the payload is
        // proportional to the bucket count, not to the size of `alerts`.
        const [
          bucketRes, currRes, prevRes, marketRes, actorRes, bookRes, exposureRes, tapeRes,
        ] = await Promise.all([
          alertBuckets(def, start, end),
          alertWindowStats(start, end, SEVERE),
          alertWindowStats(prevStart, start - 1, SEVERE),
          alertTopEntities(start, end, 'market', 8),
          alertTopEntities(start, end, 'wallet', 8),
          positionTotals(),
          positionTopMarkets(8),
          supabase.from('alert_trades').select('*').order('id', { ascending: false }).limit(20),
        ])
        if (cancelled) return

        const marketKeys = marketRes.map((m) => m.key)
        const actorKeys = actorRes.map((a) => a.key)

        // Shapes and wallet profiles only for the rows actually rendered.
        const [mSeries, aSeries, walletRes, popRes] = await Promise.all([
          alertEntitySeries(def, start, end, 'market', marketKeys),
          alertEntitySeries(def, start, end, 'wallet', actorKeys),
          actorKeys.length
            ? supabase.from('wallets').select('*').in('address', actorKeys)
            : Promise.resolve({ data: [] as WalletRow[] }),
          supabase.from('wallets').select('info_score').order('info_score', { ascending: false }).limit(500),
        ])
        if (cancelled) return

        setBuckets(bucketRes)
        setCurr(currRes)
        setPrev(prevRes)
        setTopMarkets(marketRes)
        setMarketSeries(mSeries)
        setTopActors(actorRes)
        setActorSeries(aSeries)
        setActorWallets((walletRes.data as WalletRow[]) ?? [])
        setInfoPop(
          (((popRes.data as { info_score: number }[]) ?? []).map((w) => w.info_score)).sort((a, b) => a - b),
        )
        setBook(bookRes)
        setExposure(exposureRes)
        setTape((tapeRes.data as AlertTradeRow[]) ?? [])
        setError(null)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [key, nonce, liveNonce, def, start, end, prevStart])

  // Live tape: new inserts land at the top and flash once.
  useEffect(() => {
    const channel = supabase
      .channel('dashboard-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alerts' }, () => {
        const now = Date.now()
        if (now - lastLiveRef.current < LIVE_THROTTLE_MS) return
        lastLiveRef.current = now
        setLiveNonce((n) => n + 1)
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alert_trades' }, (payload) => {
        const row = payload.new as AlertTradeRow
        flashRef.current.add(row.id)
        setTape((prevTape) => [row, ...prevTape].slice(0, 20))
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [])

  const totalTrend = useMemo(() => buckets.map((b) => b.total), [buckets])
  const severeTrend = useMemo(
    () => buckets.map((b) => SEVERE.reduce((s, t) => s + ((b[t] as number) ?? 0), 0)),
    [buckets],
  )
  const peak = useMemo(() => Math.max(0, ...buckets.map((b) => b.total)), [buckets])

  const markets = useMemo(() => {
    const max = topMarkets[0]?.total ?? 1
    return topMarkets.map((m) => ({
      name: m.key,
      total: m.total,
      wallets: m.wallets,
      dominant: m.dominant ?? '',
      share: m.total / max,
      series: marketSeries.get(m.key) ?? [],
    }))
  }, [topMarkets, marketSeries])

  const actors = useMemo(() => {
    const byAddress = new Map(actorWallets.map((w) => [w.address, w]))
    const max = topActors[0]?.total ?? 1
    return topActors.map((a) => {
      const w = byAddress.get(a.key)
      return {
        address: a.key,
        count: a.total,
        share: a.total / max,
        info: w?.info_score ?? null,
        pctl: w ? percentileOf(w.info_score, infoPop) : null,
        volume: w?.total_volume ?? null,
        label: w?.label ?? null,
        series: actorSeries.get(a.key) ?? [],
      }
    })
  }, [topActors, actorWallets, actorSeries, infoPop])

  const legendItems = ALERT_TYPE_ORDER.map((t) => ({ key: t, label: alertLabel(t), color: alertColor(t) }))
  const toggle = (k: string) =>
    setHidden((prevHidden) => {
      const next = new Set(prevHidden)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })

  const maxExposure = exposure[0]?.notional ?? 1

  return (
    <div>
      <FilterBar
        title="MARKET SURVEILLANCE"
        right={<SyncStatus />}
      />

      <div className="space-y-3">
        {error && <LoadError message={error} />}

        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
          <StatTile
            label="Alert flow" accent={SERIES[0]} value={compact(curr.total)}
            delta={changeRatio(curr.total, prev.total)} inverted
            trend={totalTrend} footnote={`vs prior ${def.label}`}
          />
          <StatTile
            label="Severe flow" accent={SERIES[1]} value={compact(curr.severe)}
            delta={changeRatio(curr.severe, prev.severe)} inverted
            trend={severeTrend} footnote="suspect + deception"
          />
          <StatTile
            label="Active wallets" accent={SERIES[2]} value={compact(curr.wallets)}
            delta={changeRatio(curr.wallets, prev.wallets)}
            footnote={`vs prior ${def.label}`}
          />
          <StatTile
            label="Markets touched" accent={SERIES[3]} value={compact(curr.markets)}
            delta={changeRatio(curr.markets, prev.markets)}
            footnote={`vs prior ${def.label}`}
          />
          <StatTile
            label="Peak intensity" accent={SERIES[5]} value={compact(peak)}
            footnote={`max alerts / ${def.label === '30D' ? 'day' : 'bucket'}`}
          />
        </div>

        {/* Exposure is a live snapshot, so it carries no period delta -- these
            tiles deliberately show no "vs prior" the way the flow tiles do. */}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <StatTile
            label="Capital at risk" accent={SERIES[4]} value={usd(book.notional)}
            footnote={`${compact(book.openLegs)} open legs · live`}
          />
          <StatTile
            label="Unrealized P&L" accent={SERIES[1]} value={usd(book.unrealized)}
            footnote={book.unrealized >= 0 ? '▲ book in profit' : '▼ book in loss'}
          />
          <StatTile
            label="Wallets with a book" accent={SERIES[2]} value={compact(book.wallets)}
            footnote="holding open exposure"
          />
          <StatTile
            label="Books at risk" accent={SERIES[3]} value={compact(book.tokens)}
            footnote="distinct outcome tokens"
          />
        </div>

        <div className="grid gap-3 xl:grid-cols-3">
          <Panel
            className="xl:col-span-2"
            title="Alert flow by type"
            meta={`${def.label} · ${compact(curr.total)} events`}
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
            meta={`top ${exposure.length} books · live`}
            loading={loading}
            table={{
              columns: ['Market', 'Notional', 'Unrealized', 'Wallets', 'Dominant side'],
              rows: exposure.map((m) => [
                m.name, m.notional.toFixed(2), m.unrealized.toFixed(2), m.wallets, m.dominant ?? '—',
              ]),
            }}
          >
            <ul className="divide-y divide-sentinel-border/40">
              {exposure.length === 0 && (
                <li className="px-3 py-4 font-mono text-[10px] uppercase text-slate-600">
                  no exposure synced
                </li>
              )}
              {exposure.map((m) => (
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
                    <MiniBar value={m.notional / maxExposure} color={outcomeColor(m.dominant)} width={72} />
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
