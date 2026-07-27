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
      <div className="flex flex-wrap items-center justify-between border-b border-sentinel-border pb-2">
        <h2 className="text-sm font-bold font-heading text-sentinel-accent uppercase tracking-widest">ALERT_EXPLORER</h2>
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-mono text-slate-500">{total} RECORDS</span>
          <div className="flex gap-2">
            <button onClick={exportCsv} className="border border-sentinel-border px-2 py-1 text-[10px] font-mono uppercase hover:bg-sentinel-border/50 transition-colors">CSV</button>
            <button onClick={exportJson} className="border border-sentinel-border px-2 py-1 text-[10px] font-mono uppercase hover:bg-sentinel-border/50 transition-colors">JSON</button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          value={typeFilter}
          onChange={(e) => { setPage(0); setTypeFilter(e.target.value) }}
          className="border border-sentinel-border bg-sentinel-bg px-2 py-1.5 text-xs font-mono outline-none focus:border-sentinel-accent"
        >
          <option value="">ALL_TYPES</option>
          {Object.entries(ALERT_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label.toUpperCase()}</option>
          ))}
        </select>
        <input
          placeholder="WALLET_0X..."
          value={walletFilter}
          onChange={(e) => { setPage(0); setWalletFilter(e.target.value) }}
          className="border border-sentinel-border bg-sentinel-bg px-2 py-1.5 text-xs font-mono outline-none focus:border-sentinel-accent"
        />
        <input
          placeholder="MARKET_ID..."
          value={marketFilter}
          onChange={(e) => { setPage(0); setMarketFilter(e.target.value) }}
          className="border border-sentinel-border bg-sentinel-bg px-2 py-1.5 text-xs font-mono outline-none focus:border-sentinel-accent"
        />
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => { setPage(0); setDateFrom(e.target.value) }}
          className="border border-sentinel-border bg-sentinel-bg px-2 py-1.5 text-xs font-mono outline-none focus:border-sentinel-accent"
        />
      </div>

      <div className="overflow-x-auto border border-sentinel-border bg-sentinel-panel">
        <table className="w-full text-xs font-mono whitespace-nowrap">
          <thead className="bg-sentinel-border/30 text-left text-[10px] uppercase tracking-wider text-slate-400 border-b border-sentinel-border">
            <tr>
              <th className="px-3 py-2 font-normal">Type</th>
              <th className="px-3 py-2 font-normal">Wallet</th>
              <th className="px-3 py-2 font-normal">Market/Asset</th>
              <th className="px-3 py-2 font-normal">Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">LOADING_DATA...</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">NO_RECORDS_FOUND</td></tr>
            )}
            {rows.map((r) => (
              <tr
                key={`${r.source_table}-${r.source_rowid}`}
                onClick={() => setSelected(r)}
                className="cursor-pointer border-b border-sentinel-border/50 hover:bg-sentinel-border/30 transition-colors"
              >
                <td className="px-3 py-2">
                  <span className="border px-1 py-0.5 text-[9px] font-bold uppercase" style={{ 
                      borderColor: ALERT_TYPE_COLORS[r.alert_type] === '#38bdf8' ? '#22C55E' : ALERT_TYPE_COLORS[r.alert_type] ?? '#64748b', 
                      color: ALERT_TYPE_COLORS[r.alert_type] === '#38bdf8' ? '#22C55E' : ALERT_TYPE_COLORS[r.alert_type] ?? '#94a3b8' 
                    }}>
                    {ALERT_TYPE_LABELS[r.alert_type] ?? r.alert_type}
                  </span>
                </td>
                <td className="px-3 py-2 text-sentinel-accent">{shortAddress(r.wallet_address)}</td>
                <td className="max-w-[150px] md:max-w-xs truncate px-3 py-2 text-slate-300">{r.market_title ?? r.asset_id ?? '---'}</td>
                <td className="px-3 py-2 text-slate-500">{formatTs(r.timestamp_ms)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 text-xs font-mono">
        <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="border border-sentinel-border px-2 py-1 disabled:opacity-40 hover:bg-sentinel-border/50">{'<'} PREV</button>
        <span className="text-slate-500">PAGE {page + 1} OF {pages}</span>
        <button disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)} className="border border-sentinel-border px-2 py-1 disabled:opacity-40 hover:bg-sentinel-border/50">NEXT {'>'}</button>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setSelected(null)}>
          <div className="max-h-[80vh] w-full max-w-2xl overflow-auto border border-sentinel-border bg-sentinel-bg shadow-2xl p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between border-b border-sentinel-border pb-2">
              <h3 className="text-xs font-bold font-mono text-sentinel-accent uppercase">
                {ALERT_TYPE_LABELS[selected.alert_type] ?? selected.alert_type} // {shortAddress(selected.wallet_address)}
              </h3>
              <button onClick={() => setSelected(null)} className="text-slate-500 hover:text-slate-200 font-mono text-[10px]">[X] CLOSE</button>
            </div>
            {typeof selected.payload?.market_url === 'string' && (
              <a href={selected.payload.market_url as string} target="_blank" rel="noreferrer" className="mb-4 inline-block text-[10px] font-mono text-sentinel-accent hover:underline uppercase border border-sentinel-accent/50 px-2 py-1">
                {'>>'} OPEN_MARKET
              </a>
            )}
            <pre className="overflow-x-auto border border-sentinel-border bg-sentinel-panel p-3 text-[10px] font-mono text-slate-300">
              {JSON.stringify(selected.payload, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
