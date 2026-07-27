import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import {
  ALERT_TYPE_COLORS, ALERT_TYPE_LABELS, formatTs, shortAddress, type AlertRow,
} from '../lib/types'

const PAGE_SIZE = 25

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
  const [rows, setRows] = useState<AlertRow[]>([])
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [typeFilter, setTypeFilter] = useState('')
  const [walletFilter, setWalletFilter] = useState('')
  const [marketFilter, setMarketFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [selected, setSelected] = useState<AlertRow | null>(null)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    let query = supabase.from('alerts').select('*', { count: 'exact' })
    if (typeFilter) query = query.eq('alert_type', typeFilter)
    if (walletFilter) query = query.ilike('wallet_address', `%${walletFilter.toLowerCase()}%`)
    if (marketFilter) query = query.ilike('market_title', `%${marketFilter}%`)
    if (dateFrom) query = query.gte('timestamp_ms', new Date(dateFrom).getTime())
    const { data, count } = await query
      .order('id', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
    setRows((data as AlertRow[]) ?? [])
    setTotal(count ?? 0)
    setLoading(false)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, typeFilter, walletFilter, marketFilter, dateFrom])

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const exportJson = () => download('alerts.json', JSON.stringify(rows, null, 2), 'application/json')
  const exportCsv = () => {
    const header = 'id,alert_type,wallet_address,asset_id,market_title,timestamp_ms'
    const lines = rows.map((r) =>
      [r.id, r.alert_type, r.wallet_address ?? '', r.asset_id ?? '', `"${(r.market_title ?? '').replaceAll('"', '""')}"`, r.timestamp_ms ?? ''].join(','),
    )
    download('alerts.csv', [header, ...lines].join('\n'), 'text/csv')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold">Alert Explorer</h2>
        <span className="text-sm text-slate-500">{total} alert</span>
        <div className="ml-auto flex gap-2">
          <button onClick={exportCsv} className="rounded border border-sentinel-border px-3 py-1 text-sm hover:bg-white/5">Export CSV</button>
          <button onClick={exportJson} className="rounded border border-sentinel-border px-3 py-1 text-sm hover:bg-white/5">Export JSON</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          value={typeFilter}
          onChange={(e) => { setPage(0); setTypeFilter(e.target.value) }}
          className="rounded border border-sentinel-border bg-sentinel-panel px-3 py-1.5 text-sm"
        >
          <option value="">Tutti i tipi</option>
          {Object.entries(ALERT_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <input
          placeholder="Wallet 0x…"
          value={walletFilter}
          onChange={(e) => { setPage(0); setWalletFilter(e.target.value) }}
          className="rounded border border-sentinel-border bg-sentinel-panel px-3 py-1.5 font-mono text-sm"
        />
        <input
          placeholder="Mercato…"
          value={marketFilter}
          onChange={(e) => { setPage(0); setMarketFilter(e.target.value) }}
          className="rounded border border-sentinel-border bg-sentinel-panel px-3 py-1.5 text-sm"
        />
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => { setPage(0); setDateFrom(e.target.value) }}
          className="rounded border border-sentinel-border bg-sentinel-panel px-3 py-1.5 text-sm"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-sentinel-border">
        <table className="w-full text-sm">
          <thead className="bg-sentinel-panel text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Wallet</th>
              <th className="px-3 py-2">Mercato</th>
              <th className="px-3 py-2">Quando</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">Caricamento…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">Nessun alert con questi filtri.</td></tr>
            )}
            {rows.map((r) => (
              <tr
                key={`${r.source_table}-${r.source_rowid}`}
                onClick={() => setSelected(r)}
                className="cursor-pointer border-t border-sentinel-border hover:bg-white/5"
              >
                <td className="px-3 py-2">
                  <span className="rounded px-2 py-0.5 text-xs font-semibold" style={{ background: `${ALERT_TYPE_COLORS[r.alert_type] ?? '#64748b'}22`, color: ALERT_TYPE_COLORS[r.alert_type] ?? '#94a3b8' }}>
                    {ALERT_TYPE_LABELS[r.alert_type] ?? r.alert_type}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono">{shortAddress(r.wallet_address)}</td>
                <td className="max-w-xs truncate px-3 py-2 text-slate-400">{r.market_title ?? r.asset_id ?? '—'}</td>
                <td className="px-3 py-2 text-slate-500">{formatTs(r.timestamp_ms)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 text-sm">
        <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="rounded border border-sentinel-border px-3 py-1 disabled:opacity-40">← Prec</button>
        <span className="text-slate-500">pagina {page + 1} / {pages}</span>
        <button disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)} className="rounded border border-sentinel-border px-3 py-1 disabled:opacity-40">Succ →</button>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={() => setSelected(null)}>
          <div className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-lg border border-sentinel-border bg-sentinel-panel p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">
                {ALERT_TYPE_LABELS[selected.alert_type] ?? selected.alert_type} — {shortAddress(selected.wallet_address)}
              </h3>
              <button onClick={() => setSelected(null)} className="text-slate-500 hover:text-slate-200">✕</button>
            </div>
            {typeof selected.payload?.market_url === 'string' && (
              <a href={selected.payload.market_url as string} target="_blank" rel="noreferrer" className="mb-3 block text-sm text-sentinel-accent hover:underline">
                Apri mercato su Polymarket ↗
              </a>
            )}
            <pre className="overflow-x-auto rounded bg-sentinel-bg p-3 text-xs text-slate-300">
              {JSON.stringify(selected.payload, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
