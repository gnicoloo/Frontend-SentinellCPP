import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, unwrap, unwrapWithCount } from '../lib/supabaseClient'
import { useSupabaseQuery } from '../hooks/useSupabaseQuery'
import { useRange } from '../context/RangeProvider'
import { shortAddress, type WalletRow } from '../lib/types'
import { alertEntitySeries, alertWalletCounts, positionWalletTotals } from '../lib/aggregates'
import { SERIES, STATUS } from '../lib/theme'
import { compact, percentileOf, pct, usd } from '../lib/format'
import { quantile } from '../lib/stats'
import FilterBar from '../components/FilterBar'
import LoadError from '../components/LoadError'
import CapNotice from '../components/CapNotice'
import Panel from '../components/viz/Panel'
import Histogram from '../components/viz/Histogram'
import MiniBar from '../components/viz/MiniBar'
import Sparkline from '../components/viz/Sparkline'
import Signed from '../components/viz/Signed'

type SortKey =
  | 'flow' | 'notional' | 'unrealized' | 'info_score' | 'suspicious_score' | 'forensic_score'
  | 'roi_estimate' | 'win_rate' | 'trades_count' | 'total_volume' | 'total_profit'

interface Column {
  key: SortKey
  label: string
  /** How the cell is rendered; drives alignment and the metric formatter. */
  format: (w: Screened) => string
  /** Only score columns get an in-row magnitude bar. */
  bar?: boolean
  hideOnMobile?: boolean
  /** Domain max for the bar; null means "scale to the visible max". */
  max?: number
  /**
   * Set on signed measures. Formats the magnitude; the direction glyph and
   * color come from <Signed>, so the sign never rests on color alone.
   */
  abs?: (v: number) => string
}

/** Exactly the columns the screener selects -- see the `wallets` query below. */
type ScreenerWallet = Pick<WalletRow,
  | 'address' | 'label' | 'suspicious_score' | 'info_score' | 'forensic_score'
  | 'roi_estimate' | 'trades_count' | 'win_count' | 'total_volume' | 'total_profit'>

interface Screened extends ScreenerWallet {
  flow: number
  win_rate: number
  info_pctl: number
  /** Live capital at risk, summed from `positions`. */
  notional: number
  unrealized: number
}

const COLUMNS: Column[] = [
  { key: 'flow', label: 'Flow', format: (w) => compact(w.flow) },
  { key: 'notional', label: 'At risk', format: (w) => usd(w.notional) },
  { key: 'unrealized', label: 'Unreal.', format: (w) => usd(w.unrealized), abs: usd },
  { key: 'info_score', label: 'Info', format: (w) => w.info_score.toFixed(1), bar: true, max: 100 },
  { key: 'suspicious_score', label: 'Susp', format: (w) => w.suspicious_score.toFixed(2), bar: true, max: 10 },
  { key: 'forensic_score', label: 'Forensic', format: (w) => w.forensic_score.toFixed(2), bar: true, max: 10, hideOnMobile: true },
  { key: 'roi_estimate', label: 'ROI', format: (w) => pct(w.roi_estimate), abs: (v) => pct(v) },
  { key: 'win_rate', label: 'Win', format: (w) => pct(w.win_rate), hideOnMobile: true },
  { key: 'trades_count', label: 'TX', format: (w) => compact(w.trades_count), hideOnMobile: true },
  { key: 'total_volume', label: 'Volume', format: (w) => usd(w.total_volume) },
  { key: 'total_profit', label: 'P&L', format: (w) => usd(w.total_profit), hideOnMobile: true, abs: usd },
]

const PAGE_SIZE_OPTIONS = [50, 100, 250, 500] as const

/** The registry slice the screener ranks. */
const REGISTRY_CAP = 500

export default function WalletList() {
  const { def, key: rangeKey, nonce, start, end } = useRange()
  const [seriesMap, setSeriesMap] = useState<Map<string, number[]>>(new Map())
  const [seriesError, setSeriesError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('info_score')
  const [desc, setDesc] = useState(true)
  const [labeledOnly, setLabeledOnly] = useState(false)
  const [activeOnly, setActiveOnly] = useState(false)
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0])
  const [pageRaw, setPage] = useState(0)

  const query = useSupabaseQuery(async () => {
    const [rows, registry] = await Promise.all([
      unwrap<ScreenerWallet[]>(
        // No column in COLUMNS/Screened reads `profile` (the full serialized
        // profile jsonb) -- pulling it for 500 rows, on a page that re-fetches
        // every 60s while open, was the single largest source of egress here.
        supabase.from('wallets')
          .select('address, label, suspicious_score, info_score, forensic_score, roi_estimate, trades_count, win_count, total_volume, total_profit')
          .order('info_score', { ascending: false })
          .limit(REGISTRY_CAP),
      ),
      // Il totale reale serve a dire quanti wallet restano fuori dal cap.
      unwrapWithCount<{ address: string }[]>(
        supabase.from('wallets').select('address', { count: 'exact', head: true }),
      ),
    ])
    const total = registry.count
    const addresses = rows.map((w) => w.address)

    // Flow and exposure are summed in Postgres for exactly these addresses.
    // Pulling raw alert/position rows and grouping them here meant the
    // derived columns only ever reflected whatever the row cap admitted.
    const [flowCounts, bookTotals] = await Promise.all([
      alertWalletCounts(start, end, addresses),
      positionWalletTotals(addresses),
    ])
    return { rows, flowCounts, bookTotals, total }
  }, [rangeKey, nonce, start, end])

  const wallets = query.data?.rows ?? []
  const flowCounts = query.data?.flowCounts ?? new Map<string, number>()
  const bookTotals = query.data?.bookTotals ?? new Map<string, { notional: number; unrealized: number }>()
  const registryTotal = query.data?.total ?? 0
  const loading = query.isLoading

  const screened = useMemo<Screened[]>(() => {
    const infoPop = wallets.map((w) => w.info_score).sort((a, b) => a - b)
    return wallets.map((w) => {
      const exposure = bookTotals.get(w.address)
      return {
        ...w,
        flow: flowCounts.get(w.address) ?? 0,
        win_rate: w.trades_count > 0 ? w.win_count / w.trades_count : 0,
        info_pctl: percentileOf(w.info_score, infoPop),
        notional: exposure?.notional ?? 0,
        unrealized: exposure?.unrealized ?? 0,
      }
    })
  }, [wallets, flowCounts, bookTotals])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return screened.filter((w) => {
      if (needle && !w.address.toLowerCase().includes(needle) && !(w.label ?? '').toLowerCase().includes(needle)) return false
      if (labeledOnly && !w.label) return false
      if (activeOnly && w.flow === 0) return false
      return true
    })
  }, [screened, search, labeledOnly, activeOnly])

  const sorted = useMemo(() => {
    const dir = desc ? -1 : 1
    return [...filtered].sort((a, b) => (Number(a[sortKey]) - Number(b[sortKey])) * dir)
  }, [filtered, sortKey, desc])

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  const page = Math.min(pageRaw, pageCount - 1)
  const visible = useMemo(
    () => sorted.slice(page * pageSize, page * pageSize + pageSize),
    [sorted, pageSize, page],
  )

  useEffect(() => { setPage(0) }, [search, labeledOnly, activeOnly, sortKey, desc, pageSize])

  // Shapes load for the rendered page only, so the payload stays flat as the
  // registry grows. Joined into a string so the effect keys on the addresses
  // themselves rather than on a fresh array identity every render.
  const visibleKey = visible.map((w) => w.address).join(',')
  useEffect(() => {
    let cancelled = false
    const addresses = visibleKey ? visibleKey.split(',') : []
    if (addresses.length === 0) {
      setSeriesMap(new Map())
      return
    }
    void alertEntitySeries(def, start, end, 'wallet', addresses)
      .then((m) => { if (!cancelled) setSeriesMap(m) })
      .catch((e) => { if (!cancelled) setSeriesError(e instanceof Error ? e.message : String(e)) })
    return () => { cancelled = true }
  }, [visibleKey, def, start, end])

  const sortCol = COLUMNS.find((c) => c.key === sortKey)!
  const barMax = useMemo(() => {
    const vals = filtered.map((w) => Number(w[sortKey]))
    return Math.max(1, ...vals)
  }, [filtered, sortKey])
  const distribution = useMemo(() => filtered.map((w) => Number(w[sortKey])), [filtered, sortKey])

  const onSort = (k: SortKey) => {
    if (k === sortKey) setDesc((d) => !d)
    else { setSortKey(k); setDesc(true) }
  }

  return (
    <div>
      <FilterBar title="WALLET SCREENER">
        <input
          placeholder="0xADDRESS or label…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-sentinel-border bg-sentinel-bg px-2 py-1 font-mono text-xs outline-none placeholder:text-slate-700 focus:border-sentinel-accent"
        />
        <Toggle on={labeledOnly} onClick={() => setLabeledOnly((v) => !v)} label="Labeled" />
        <Toggle on={activeOnly} onClick={() => setActiveOnly((v) => !v)} label={`Active in ${def.label}`} />
        <span className="font-mono text-[10px] uppercase text-slate-600">
          {compact(sorted.length)} / {compact(screened.length)} wallets
        </span>
      </FilterBar>

      <div className="space-y-3">
        {(query.error || seriesError) && (
          <LoadError message={query.error ?? seriesError ?? ''} onRetry={query.refresh} />
        )}

        <CapNotice
          shown={wallets.length}
          cap={REGISTRY_CAP}
          total={registryTotal}
          unit="wallet"
          hint="il registro è ordinato per info score: i wallet oltre il cap non entrano nello screener"
        />

        <Panel
          title={`Distribution · ${sortCol.label}`}
          meta={`n=${filtered.length} · sorted ${desc ? 'desc' : 'asc'}`}
          loading={loading}
          table={{
            columns: ['Percentile', sortCol.label],
            rows: [10, 25, 50, 75, 90, 99].map((p) => [`p${p}`, quantile(distribution, p).toFixed(2)]),
          }}
        >
          <div className="px-3 pb-2 pt-1">
            <Histogram
              values={distribution}
              color={SERIES[0]}
              height={92}
              format={(v) => (Math.abs(v) >= 1000 ? compact(v) : v.toFixed(1))}
              marker={sorted[0] ? Number(sorted[0][sortKey]) : null}
              markerLabel={sorted[0] ? shortAddress(sorted[0].address) : undefined}
            />
          </div>
        </Panel>

        <Panel
          title="Registry"
          meta={`click a header to sort · ${def.label} flow · page ${page + 1}/${pageCount} · showing ${compact(visible.length)} / ${compact(sorted.length)}`}
          loading={loading}
          actions={
            <>
              <label className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-slate-500">
                Rows
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="border border-sentinel-border bg-sentinel-bg px-1 py-0.5 font-mono text-[10px] text-slate-300 outline-none focus:border-sentinel-accent"
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="border border-sentinel-border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-slate-500 transition-colors hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-slate-500"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={page >= pageCount - 1}
                className="border border-sentinel-border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-slate-500 transition-colors hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-slate-500"
              >
                Next
              </button>
            </>
          }
          table={{
            columns: ['Wallet', ...COLUMNS.map((c) => c.label)],
            rows: sorted.map((w) => [w.address, ...COLUMNS.map((c) => c.format(w))]),
          }}
        >
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-[11px]">
              <thead className="border-b border-sentinel-border text-left font-mono text-[9px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-1.5 font-normal">Wallet</th>
                  <th className="px-3 py-1.5 font-normal">Shape</th>
                  {COLUMNS.map((c) => (
                    <th
                      key={c.key}
                      onClick={() => onSort(c.key)}
                      aria-sort={sortKey === c.key ? (desc ? 'descending' : 'ascending') : 'none'}
                      className={`cursor-pointer px-3 py-1.5 text-right font-normal transition-colors hover:text-slate-200 ${
                        c.hideOnMobile ? 'hidden lg:table-cell' : ''
                      } ${sortKey === c.key ? 'text-sentinel-accent' : ''}`}
                    >
                      {c.label}
                      <span className="ml-1 inline-block w-2">{sortKey === c.key ? (desc ? '▼' : '▲') : ''}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!loading && sorted.length === 0 && (
                  <tr><td colSpan={COLUMNS.length + 2} className="px-3 py-6 text-center font-mono text-[10px] uppercase text-slate-600">no wallets match the screen</td></tr>
                )}
                {visible.map((w) => (
                  <tr key={w.address} className="border-b border-sentinel-border/40 hover:bg-white/[0.03]">
                    <td className="px-3 py-1.5">
                      <Link to={`/wallet/${w.address}`} className="font-mono text-sentinel-accent hover:underline">
                        {shortAddress(w.address)}
                      </Link>
                      {w.label && (
                        <span className="ml-2 border px-1 font-mono text-[9px] uppercase" style={{ borderColor: STATUS.critical, color: STATUS.critical }}>
                          {w.label}
                        </span>
                      )}
                      <span className="ml-2 font-mono text-[9px] text-slate-600">p{Math.round(w.info_pctl * 100)}</span>
                    </td>
                    <td className="px-3 py-1">
                      <Sparkline values={seriesMap.get(w.address) ?? []} color={SERIES[0]} width={64} height={14} label={`${w.address} flow`} />
                    </td>
                    {COLUMNS.map((c) => {
                      const raw = Number(w[c.key])
                      const isSorted = sortKey === c.key
                      return (
                        <td
                          key={c.key}
                          className={`num px-3 py-1.5 text-right ${c.hideOnMobile ? 'hidden lg:table-cell' : ''} ${
                            isSorted ? 'text-slate-100' : 'text-slate-400'
                          }`}
                        >
                          <span className="inline-flex items-center justify-end gap-2">
                            {c.bar && (
                              <MiniBar
                                value={raw / (c.max ?? barMax)}
                                color={isSorted ? SERIES[0] : SERIES[2]}
                                width={32}
                                title={`${c.label} ${c.format(w)}`}
                              />
                            )}
                            {c.abs
                              ? <Signed value={raw} format={c.abs} />
                              : <span>{c.format(w)}</span>}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  )
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`border px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
        on
          ? 'border-sentinel-accent bg-sentinel-accent/10 text-sentinel-accent'
          : 'border-sentinel-border text-slate-500 hover:text-slate-200'
      }`}
    >
      {on ? '✓ ' : ''}{label}
    </button>
  )
}
