import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useRange } from '../context/RangeProvider'
import { bucketize } from '../lib/range'
import {
  ALERT_TYPE_ORDER, alertColor, alertLabel, formatTs, shortAddress, type AlertRow,
} from '../lib/types'
import { STATUS } from '../lib/theme'
import { ago, compact } from '../lib/format'
import FilterBar from '../components/FilterBar'
import Panel from '../components/viz/Panel'
import ActivityChart from '../components/viz/ActivityChart'
import Legend from '../components/viz/Legend'

const PAGE_SIZE = 30
const HIST_CAP = 6000

/** The subset of the PostgREST builder the shared filter needs. */
interface FilterChain {
  gte(column: string, value: number): FilterChain
  lte(column: string, value: number): FilterChain
  in(column: string, values: string[]): FilterChain
  ilike(column: string, pattern: string): FilterChain
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function AlertExplorer() {
  const { def, key: rangeKey, nonce, start, end } = useRange()
  const [params, setParams] = useSearchParams()

  const [rows, setRows] = useState<AlertRow[]>([])
  const [hist, setHist] = useState<{ alert_type: string; timestamp_ms: number | null }[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [types, setTypes] = useState<Set<string>>(new Set())
  const [wallet, setWallet] = useState('')
  const [market, setMarket] = useState(params.get('market') ?? '')
  const [selected, setSelected] = useState<AlertRow | null>(null)
  const [cursor, setCursor] = useState(0)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const tableRef = useRef<HTMLTableSectionElement>(null)

  // A market link from another view seeds the filter exactly once.
  useEffect(() => {
    const m = params.get('market')
    if (m !== null && m !== market) setMarket(m)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  /**
   * The one place the query is defined. The page, the density chart and the
   * export all run through it, so they can never describe different slices.
   */
  const applyFilters = useCallback(
    <T,>(builder: T): T => {
      let q = builder as unknown as FilterChain
      q = q.gte('timestamp_ms', start).lte('timestamp_ms', end)
      if (types.size > 0) q = q.in('alert_type', [...types])
      if (wallet.trim()) q = q.ilike('wallet_address', `%${wallet.trim().toLowerCase()}%`)
      if (market.trim()) q = q.ilike('market_title', `%${market.trim()}%`)
      return q as unknown as T
    },
    [start, end, types, wallet, market],
  )

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      const pageRes = await applyFilters(supabase.from('alerts').select('*', { count: 'exact' }))
        .order('timestamp_ms', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
      const histRes = await applyFilters(supabase.from('alerts').select('alert_type, timestamp_ms')).limit(HIST_CAP)
      if (cancelled) return
      setRows((pageRes.data as AlertRow[]) ?? [])
      setTotal(pageRes.count ?? 0)
      setHist((histRes.data as { alert_type: string; timestamp_ms: number | null }[]) ?? [])
      setCursor(0)
      setLoading(false)
    }
    void load()
    return () => { cancelled = true }
  }, [applyFilters, page, rangeKey, nonce])

  // Filters reset the page: staying on page 7 of a 2-page result shows nothing.
  useEffect(() => { setPage(0) }, [types, wallet, market, rangeKey])

  const buckets = useMemo(
    () => bucketize(hist, (r) => r.timestamp_ms, (r) => r.alert_type, def, start, end),
    [hist, def, start, end],
  )
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const legendItems = ALERT_TYPE_ORDER.map((t) => ({ key: t, label: alertLabel(t), color: alertColor(t) }))

  const toggleType = (t: string) =>
    setTypes((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })

  // j/k walk the result set, Enter opens the inspector -- no mouse required.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || selected) return
      if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(rows.length - 1, c + 1)) }
      if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)) }
      if (e.key === 'Enter' && rows[cursor]) { e.preventDefault(); setSelected(rows[cursor]) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rows, cursor, selected])

  useEffect(() => {
    tableRef.current?.querySelectorAll('tr')[cursor]?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  /** Exports the whole filtered slice, not just the visible page. */
  const exportAll = async (kind: 'csv' | 'json') => {
    setExporting(true)
    const { data } = await applyFilters(supabase.from('alerts').select('*'))
      .order('timestamp_ms', { ascending: false })
      .limit(HIST_CAP)
    const all = (data as AlertRow[]) ?? []
    if (kind === 'json') {
      download('sentinel_alerts.json', JSON.stringify(all, null, 2), 'application/json')
    } else {
      const esc = (v: unknown) => `"${String(v ?? '').replaceAll('"', '""')}"`
      const header = 'id,alert_type,wallet_address,asset_id,market_title,timestamp_ms,iso_time'
      const lines = all.map((r) =>
        [r.id, r.alert_type, r.wallet_address ?? '', r.asset_id ?? '', esc(r.market_title), r.timestamp_ms ?? '',
          r.timestamp_ms ? new Date(r.timestamp_ms).toISOString() : ''].join(','),
      )
      download('sentinel_alerts.csv', [header, ...lines].join('\n'), 'text/csv')
    }
    setExporting(false)
  }

  return (
    <div>
      <FilterBar
        title="ALERT EXPLORER"
        right={
          <div className="flex gap-1.5">
            <button
              onClick={() => void exportAll('csv')}
              disabled={exporting}
              className="border border-sentinel-border px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-slate-400 hover:text-slate-100 disabled:opacity-40"
            >
              CSV
            </button>
            <button
              onClick={() => void exportAll('json')}
              disabled={exporting}
              className="border border-sentinel-border px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-slate-400 hover:text-slate-100 disabled:opacity-40"
            >
              JSON
            </button>
          </div>
        }
      >
        <input
          placeholder="wallet 0x…"
          value={wallet}
          onChange={(e) => setWallet(e.target.value)}
          className="w-36 border border-sentinel-border bg-sentinel-bg px-2 py-1 font-mono text-xs outline-none placeholder:text-slate-700 focus:border-sentinel-accent"
        />
        <input
          placeholder="market contains…"
          value={market}
          onChange={(e) => { setMarket(e.target.value); setParams({}, { replace: true }) }}
          className="w-44 border border-sentinel-border bg-sentinel-bg px-2 py-1 font-mono text-xs outline-none placeholder:text-slate-700 focus:border-sentinel-accent"
        />
        <span className="num font-mono text-[10px] uppercase text-slate-600">{compact(total)} records</span>
      </FilterBar>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[9px] uppercase tracking-wider text-slate-600">type</span>
          {ALERT_TYPE_ORDER.map((t) => {
            const on = types.size === 0 || types.has(t)
            return (
              <button
                key={t}
                onClick={() => toggleType(t)}
                aria-pressed={types.has(t)}
                className={`flex items-center gap-1.5 border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider transition-colors ${
                  types.has(t) ? 'border-slate-400 text-slate-100' : 'border-sentinel-border text-slate-500 hover:text-slate-200'
                }`}
              >
                <span className="inline-block h-2 w-2" style={{ background: alertColor(t), opacity: on ? 1 : 0.3 }} />
                {alertLabel(t)}
              </button>
            )
          })}
          {types.size > 0 && (
            <button onClick={() => setTypes(new Set())} className="font-mono text-[9px] uppercase text-slate-600 underline hover:text-slate-300">
              clear
            </button>
          )}
        </div>

        <Panel
          title="Query density"
          meta={`${def.label} · ${compact(hist.length)} matched${hist.length >= HIST_CAP ? ' (capped)' : ''}`}
          loading={loading}
          table={{
            columns: ['Time', ...ALERT_TYPE_ORDER.map(alertLabel), 'Total'],
            rows: buckets.map((b) => [def.stamp(b.t), ...ALERT_TYPE_ORDER.map((t) => (b[t] as number) ?? 0), b.total]),
          }}
        >
          <div className="p-3">
            <ActivityChart data={buckets} series={legendItems} tick={def.tick} stamp={def.stamp} height={140} unit="alerts" />
            <div className="mt-2 border-t border-sentinel-border pt-2">
              <Legend items={legendItems} />
            </div>
          </div>
        </Panel>

        <Panel
          title="Result set"
          meta={`page ${page + 1} / ${pages} · j/k to walk · enter to inspect`}
          loading={loading}
        >
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-[11px]">
              <thead className="border-b border-sentinel-border text-left font-mono text-[9px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-1.5 font-normal">Type</th>
                  <th className="px-3 py-1.5 font-normal">Wallet</th>
                  <th className="px-3 py-1.5 font-normal">Market / asset</th>
                  <th className="px-3 py-1.5 text-right font-normal">Timestamp</th>
                  <th className="px-3 py-1.5 text-right font-normal">Age</th>
                </tr>
              </thead>
              <tbody ref={tableRef}>
                {!loading && rows.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-6 text-center font-mono text-[10px] uppercase text-slate-600">no records match the query</td></tr>
                )}
                {rows.map((r, i) => (
                  <tr
                    key={`${r.source_table}-${r.source_rowid}`}
                    onClick={() => { setCursor(i); setSelected(r) }}
                    className={`cursor-pointer border-b border-sentinel-border/40 transition-colors ${
                      i === cursor ? 'bg-sentinel-accent/10' : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    <td className="px-3 py-1.5">
                      <span
                        className="border-l-2 pl-1.5 font-mono text-[9px] uppercase text-slate-400"
                        style={{ borderColor: alertColor(r.alert_type) }}
                      >
                        {alertLabel(r.alert_type)}
                      </span>
                    </td>
                    <td className="px-3 py-1.5">
                      {r.wallet_address ? (
                        <Link
                          to={`/wallet/${r.wallet_address}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-mono text-sentinel-accent hover:underline"
                        >
                          {shortAddress(r.wallet_address)}
                        </Link>
                      ) : <span className="font-mono text-slate-600">—</span>}
                    </td>
                    <td className="max-w-[220px] truncate px-3 py-1.5 text-slate-300 md:max-w-md" title={r.market_title ?? undefined}>
                      {r.market_title ?? r.asset_id ?? '—'}
                    </td>
                    <td className="num px-3 py-1.5 text-right text-slate-500">{formatTs(r.timestamp_ms)}</td>
                    <td className="num px-3 py-1.5 text-right text-slate-600">{ago(r.timestamp_ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3 border-t border-sentinel-border px-3 py-1.5 font-mono text-[10px]">
            <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="border border-sentinel-border px-2 py-0.5 uppercase disabled:opacity-40 hover:bg-white/5">« prev</button>
            <span className="num text-slate-500">{page * PAGE_SIZE + 1}–{Math.min(total, (page + 1) * PAGE_SIZE)} of {compact(total)}</span>
            <button disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)} className="border border-sentinel-border px-2 py-0.5 uppercase disabled:opacity-40 hover:bg-white/5">next »</button>
          </div>
        </Panel>
      </div>

      {selected && <Inspector alert={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

/** Renders the payload as labelled fields; raw JSON stays one keystroke away. */
function Inspector({ alert, onClose }: { alert: AlertRow; onClose: () => void }) {
  const [raw, setRaw] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const fields = Object.entries(alert.payload ?? {})
  const marketUrl = typeof alert.payload?.market_url === 'string' ? alert.payload.market_url : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Alert detail"
        className="flex max-h-[82vh] w-full max-w-3xl flex-col border border-sentinel-border bg-sentinel-bg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex flex-wrap items-center gap-2 border-b border-sentinel-border px-3 py-2">
          <span
            className="border-l-2 pl-1.5 font-mono text-[10px] font-bold uppercase text-slate-200"
            style={{ borderColor: alertColor(alert.alert_type) }}
          >
            {alertLabel(alert.alert_type)}
          </span>
          {alert.wallet_address && (
            <Link to={`/wallet/${alert.wallet_address}`} className="font-mono text-[11px] text-sentinel-accent hover:underline">
              {shortAddress(alert.wallet_address)}
            </Link>
          )}
          <span className="num font-mono text-[10px] text-slate-500">{formatTs(alert.timestamp_ms)}</span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setRaw((v) => !v)}
              className={`border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
                raw ? 'border-sentinel-accent text-sentinel-accent' : 'border-sentinel-border text-slate-500 hover:text-slate-200'
              }`}
            >
              RAW
            </button>
            <button onClick={onClose} className="font-mono text-[10px] text-slate-500 hover:text-slate-200">[ESC]</button>
          </div>
        </header>

        <div className="border-b border-sentinel-border px-3 py-2">
          <p className="text-xs text-slate-200">{alert.market_title ?? alert.asset_id ?? 'unknown market'}</p>
          <p className="mt-0.5 font-mono text-[10px] text-slate-600">
            {alert.source_table} #{alert.source_rowid} · synced {new Date(alert.created_at).toLocaleString('it-IT')}
          </p>
          {marketUrl && (
            <a
              href={marketUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 inline-block border border-sentinel-accent/50 px-2 py-0.5 font-mono text-[10px] uppercase text-sentinel-accent hover:underline"
            >
              open market »
            </a>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {raw ? (
            <pre className="p-3 font-mono text-[10px] leading-relaxed text-slate-300">
              {JSON.stringify(alert.payload, null, 2)}
            </pre>
          ) : (
            <dl className="divide-y divide-sentinel-border/40">
              {fields.length === 0 && <p className="px-3 py-4 font-mono text-[10px] uppercase text-slate-600">empty payload</p>}
              {fields.map(([k, v]) => (
                <div key={k} className="flex gap-3 px-3 py-1.5">
                  <dt className="w-44 shrink-0 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                    {k.replaceAll('_', ' ')}
                  </dt>
                  <dd className="num min-w-0 flex-1 break-words text-[11px] text-slate-200">{renderValue(v)}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </div>
  )
}

function renderValue(v: unknown) {
  if (v === null || v === undefined) return <span className="text-slate-600">—</span>
  if (typeof v === 'boolean') {
    return (
      <span style={{ color: v ? STATUS.good : STATUS.critical }}>{v ? '✓ true' : '✗ false'}</span>
    )
  }
  if (typeof v === 'number') {
    // Epoch-millis fields are unreadable as raw integers in a forensic readout.
    if (v > 1e12 && v < 4e12) return <>{formatTs(v)} <span className="text-slate-600">({v})</span></>
    return <>{v.toLocaleString('en-US')}</>
  }
  if (Array.isArray(v)) {
    return (
      <ul className="space-y-0.5">
        {v.slice(0, 20).map((item, i) => <li key={i} className="text-slate-300">{renderValue(item)}</li>)}
        {v.length > 20 && <li className="text-slate-600">…{v.length - 20} more</li>}
      </ul>
    )
  }
  if (typeof v === 'object') {
    return (
      <pre className="whitespace-pre-wrap font-mono text-[10px] text-slate-400">{JSON.stringify(v, null, 2)}</pre>
    )
  }
  const s = String(v)
  if (/^0x[0-9a-fA-F]{20,}$/.test(s)) {
    return <Link to={`/wallet/${s.toLowerCase()}`} className="text-sentinel-accent hover:underline">{shortAddress(s)}</Link>
  }
  return <>{s}</>
}
