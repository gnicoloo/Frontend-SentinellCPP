import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useRange } from '../context/RangeProvider'
import { isCoordinated, shortAddress, twapDuration, type TwapPatternRow } from '../lib/types'
import { SERIES } from '../lib/theme'
import { ago, compact, duration } from '../lib/format'
import { median } from '../lib/stats'
import FilterBar from '../components/FilterBar'
import Panel from '../components/viz/Panel'
import StatTile from '../components/viz/StatTile'
import Legend from '../components/viz/Legend'
import MiniBar from '../components/viz/MiniBar'
import ExecutionTimeline, { type TimelineSpan } from '../components/viz/ExecutionTimeline'
import ScatterPlot, { type ScatterPoint } from '../components/viz/Scatter'

/** Solo execution vs several wallets slicing the same book together. */
const SOLO = SERIES[0]
const COORDINATED = SERIES[1]

const SERIES_KEYS = [
  { key: 'solo', label: 'Single wallet', color: SOLO },
  { key: 'coordinated', label: 'Multi-wallet', color: COORDINATED },
]

export default function TwapScanner() {
  const { def, key: rangeKey, nonce, start, end } = useRange()
  const navigate = useNavigate()

  const [rows, setRows] = useState<TwapPatternRow[]>([])
  const [loading, setLoading] = useState(true)
  const [coordOnly, setCoordOnly] = useState(false)
  const [marketFilter, setMarketFilter] = useState('')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      // A window overlaps the range when it starts before the range ends and
      // ends after the range begins -- filtering on start_time alone would
      // drop long executions already running when the window opened.
      const { data } = await supabase
        .from('twap_patterns')
        .select('*')
        .lte('start_time', end)
        .gte('end_time', start)
        .order('end_time', { ascending: false })
        .limit(1000)
      if (cancelled) return
      setRows((data as TwapPatternRow[]) ?? [])
      setLoading(false)
    }
    void load()
    return () => { cancelled = true }
  }, [rangeKey, nonce, start, end])

  const filtered = useMemo(() => {
    const needle = marketFilter.trim().toLowerCase()
    return rows.filter((p) => {
      if (coordOnly && !isCoordinated(p)) return false
      if (needle) {
        const hay = `${p.market_slug ?? ''} ${p.condition_id}`.toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  }, [rows, coordOnly, marketFilter])

  const book = (p: TwapPatternRow) => p.market_slug || p.condition_id

  const kpis = useMemo(() => {
    const cadences = filtered.map((p) => p.cadence_seconds).filter((c): c is number => !!c)
    const coordinated = filtered.filter(isCoordinated)
    const participants = new Set(filtered.flatMap((p) => p.wallets ?? []))
    return {
      windows: filtered.length,
      coordinated: coordinated.length,
      volume: filtered.reduce((s, p) => s + (p.total_volume ?? 0), 0),
      slices: filtered.reduce((s, p) => s + (p.trade_count ?? 0), 0),
      medianCadence: cadences.length ? median(cadences) : null,
      books: new Set(filtered.map(book)).size,
      participants: participants.size,
    }
  }, [filtered])

  const spans = useMemo<TimelineSpan[]>(
    () => filtered
      .filter((p) => p.start_time && p.end_time)
      .map((p) => ({
        id: String(p.id),
        lane: book(p),
        start: p.start_time!,
        end: p.end_time!,
        color: isCoordinated(p) ? COORDINATED : SOLO,
        detail: [
          { value: compact(p.trade_count ?? 0), label: 'slices' },
          { value: duration((p.cadence_seconds ?? 0) * 1000), label: 'cadence' },
          { value: duration(twapDuration(p)), label: 'duration' },
          { value: compact(p.total_volume ?? 0), label: 'shares' },
          { value: compact(p.avg_size ?? 0), label: 'avg slice' },
          { value: String(p.wallets?.length ?? 0), label: 'wallets' },
        ],
        onClick: () => navigate(`/alerts?market=${encodeURIComponent(book(p))}`),
      })),
    [filtered, navigate],
  )

  const points = useMemo<ScatterPoint[]>(
    () => filtered
      .filter((p) => (p.cadence_seconds ?? 0) > 0 && (p.trade_count ?? 0) > 0)
      .map((p) => ({
        x: p.cadence_seconds!,
        y: p.trade_count!,
        z: Math.max(1, p.total_volume ?? 1),
        label: book(p),
        color: isCoordinated(p) ? COORDINATED : SOLO,
        detail: [
          { value: duration((p.cadence_seconds ?? 0) * 1000), label: 'cadence' },
          { value: compact(p.trade_count ?? 0), label: 'slices' },
          { value: compact(p.total_volume ?? 0), label: 'shares' },
          { value: String(p.wallets?.length ?? 0), label: 'wallets' },
        ],
      })),
    [filtered],
  )

  const maxVolume = Math.max(1, ...filtered.map((p) => p.total_volume ?? 0))

  return (
    <div>
      <FilterBar title="EXECUTION SCANNER">
        <input
          placeholder="market or condition_id…"
          value={marketFilter}
          onChange={(e) => setMarketFilter(e.target.value)}
          className="w-48 border border-sentinel-border bg-sentinel-bg px-2 py-1 font-mono text-xs outline-none placeholder:text-slate-700 focus:border-sentinel-accent"
        />
        <button
          type="button"
          onClick={() => setCoordOnly((v) => !v)}
          aria-pressed={coordOnly}
          className={`border px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
            coordOnly
              ? 'border-sentinel-accent bg-sentinel-accent/10 text-sentinel-accent'
              : 'border-sentinel-border text-slate-500 hover:text-slate-200'
          }`}
        >
          {coordOnly ? '✓ ' : ''}Multi-wallet only
        </button>
        <span className="num font-mono text-[10px] uppercase text-slate-600">
          {compact(filtered.length)} / {compact(rows.length)} windows
        </span>
      </FilterBar>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          <StatTile label="Execution windows" accent={SERIES[0]} value={compact(kpis.windows)} footnote={`overlapping ${def.label}`} />
          <StatTile label="Multi-wallet" accent={SERIES[1]} value={compact(kpis.coordinated)}
            footnote={kpis.windows ? `${Math.round((kpis.coordinated / kpis.windows) * 100)}% of windows` : 'coordinated slicing'} />
          <StatTile label="Sliced volume" accent={SERIES[2]} value={compact(kpis.volume)} footnote="shares executed" />
          <StatTile label="Total slices" accent={SERIES[3]} value={compact(kpis.slices)} footnote="individual fills" />
          <StatTile label="Median cadence" accent={SERIES[4]}
            value={kpis.medianCadence !== null ? duration(kpis.medianCadence * 1000) : '—'} footnote="between slices" />
          <StatTile label="Books / wallets" accent={SERIES[5]} value={`${compact(kpis.books)} / ${compact(kpis.participants)}`}
            footnote="markets · participants" />
        </div>

        {!loading && rows.length === 0 && (
          <p className="border border-sentinel-border bg-sentinel-panel px-3 py-2 font-mono text-[10px] uppercase text-slate-500">
            no twap windows in {def.label} — widen the range, or the mirror is empty if the sync has not run
          </p>
        )}

        <Panel
          title="Execution timeline"
          meta={`${spans.length} windows · lane = market`}
          loading={loading}
          actions={<Legend items={SERIES_KEYS} />}
          table={{
            columns: ['Market', 'Start', 'End', 'Duration', 'Slices', 'Cadence', 'Shares', 'Wallets'],
            rows: filtered.map((p) => [
              book(p),
              p.start_time ? new Date(p.start_time).toLocaleString('it-IT') : '—',
              p.end_time ? new Date(p.end_time).toLocaleString('it-IT') : '—',
              duration(twapDuration(p)),
              p.trade_count ?? 0,
              duration((p.cadence_seconds ?? 0) * 1000),
              (p.total_volume ?? 0).toFixed(2),
              p.wallets?.length ?? 0,
            ]),
          }}
        >
          <ExecutionTimeline spans={spans} start={start} end={end} tick={def.tick} stamp={def.stamp} />
        </Panel>

        <div className="grid gap-3 xl:grid-cols-2">
          <Panel
            title="Cadence signature"
            meta="bubble area = shares executed"
            loading={loading}
            actions={<Legend items={SERIES_KEYS} />}
            table={{
              columns: ['Market', 'Cadence (s)', 'Slices', 'Shares'],
              rows: points.map((p) => [p.label, p.x.toFixed(2), p.y, p.z.toFixed(2)]),
            }}
          >
            <div className="pb-2 pt-1">
              <ScatterPlot
                points={points}
                xLabel="cadence between slices (s, log)"
                yLabel="slices"
                logX
                xFormat={(v) => duration(v * 1000)}
                yFormat={(v) => compact(v)}
              />
            </div>
            <p className="border-t border-sentinel-border px-3 py-1.5 font-mono text-[9px] uppercase leading-relaxed text-slate-600">
              tight cadence + many slices = machine execution. the detector's own
              cv thresholds are not stored per row, so nothing here restates them.
            </p>
          </Panel>

          <Panel
            title="Windows by volume"
            meta={`top ${Math.min(12, filtered.length)}`}
            loading={loading}
            table={{
              columns: ['Market', 'Shares', 'Slices', 'Avg slice', 'Wallets'],
              rows: filtered.map((p) => [
                book(p), (p.total_volume ?? 0).toFixed(2), p.trade_count ?? 0,
                (p.avg_size ?? 0).toFixed(2), p.wallets?.length ?? 0,
              ]),
            }}
          >
            <ul className="max-h-[300px] divide-y divide-sentinel-border/40 overflow-y-auto">
              {filtered.length === 0 && (
                <li className="px-3 py-4 font-mono text-[10px] uppercase text-slate-600">no windows match the filter</li>
              )}
              {[...filtered]
                .sort((a, b) => (b.total_volume ?? 0) - (a.total_volume ?? 0))
                .slice(0, 12)
                .map((p) => {
                  const coord = isCoordinated(p)
                  return (
                    <li key={p.id} className="px-3 py-1.5">
                      <div className="flex items-baseline gap-2">
                        <span
                          className="inline-block h-2 w-2 shrink-0 self-center"
                          style={{ background: coord ? COORDINATED : SOLO }}
                          title={coord ? 'multi-wallet' : 'single wallet'}
                        />
                        <Link
                          to={`/alerts?market=${encodeURIComponent(book(p))}`}
                          className="min-w-0 flex-1 truncate text-[11px] text-slate-200 hover:text-sentinel-accent hover:underline"
                          title={book(p)}
                        >
                          {book(p)}
                        </Link>
                        <span className="num shrink-0 text-[11px] font-semibold text-slate-100">
                          {compact(p.total_volume ?? 0)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 pl-4">
                        <MiniBar value={(p.total_volume ?? 0) / maxVolume} color={coord ? COORDINATED : SOLO} width={60} />
                        <span className="font-mono text-[9px] uppercase text-slate-600">
                          {compact(p.trade_count ?? 0)} slices · {duration((p.cadence_seconds ?? 0) * 1000)} cadence
                        </span>
                        <span className="ml-auto font-mono text-[9px] uppercase text-slate-600">
                          {p.end_time ? `${ago(p.end_time)} ago` : '—'}
                        </span>
                      </div>
                      {coord && (
                        <div className="mt-1 flex flex-wrap gap-x-2 pl-4">
                          {(p.wallets ?? []).slice(0, 6).map((w) => (
                            <Link key={w} to={`/wallet/${w}`} className="font-mono text-[9px] text-sentinel-accent hover:underline">
                              {shortAddress(w)}
                            </Link>
                          ))}
                          {(p.wallets?.length ?? 0) > 6 && (
                            <span className="font-mono text-[9px] text-slate-700">+{p.wallets!.length - 6}</span>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  )
}
