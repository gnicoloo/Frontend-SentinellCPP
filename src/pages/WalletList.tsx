import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { shortAddress, type WalletRow } from '../lib/types'

type SortKey = 'info_score' | 'suspicious_score' | 'forensic_score' | 'total_volume' | 'trades_count' | 'roi_estimate'

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'info_score', label: 'Info' },
  { key: 'suspicious_score', label: 'Sospetto' },
  { key: 'forensic_score', label: 'Forensic' },
  { key: 'roi_estimate', label: 'ROI' },
  { key: 'trades_count', label: 'Trade' },
  { key: 'total_volume', label: 'Volume' },
]

export default function WalletList() {
  const [rows, setRows] = useState<WalletRow[]>([])
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('info_score')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      let query = supabase.from('wallets').select('*')
      if (search) query = query.ilike('address', `%${search.toLowerCase()}%`)
      const { data } = await query.order(sortKey, { ascending: false }).limit(200)
      setRows((data as WalletRow[]) ?? [])
      setLoading(false)
    }
    void load()
  }, [search, sortKey])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold">Wallet</h2>
        <input
          placeholder="Cerca 0x…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ml-auto rounded border border-sentinel-border bg-sentinel-panel px-3 py-1.5 font-mono text-sm"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-sentinel-border">
        <table className="w-full text-sm">
          <thead className="bg-sentinel-panel text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Wallet</th>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  onClick={() => setSortKey(c.key)}
                  className={`cursor-pointer px-3 py-2 hover:text-slate-200 ${sortKey === c.key ? 'text-sentinel-accent' : ''}`}
                >
                  {c.label} {sortKey === c.key ? '▼' : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">Caricamento…</td></tr>}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">Nessun wallet (avvia scripts/sync_to_supabase.py).</td></tr>
            )}
            {rows.map((w) => (
              <tr key={w.address} className="border-t border-sentinel-border hover:bg-white/5">
                <td className="px-3 py-2 font-mono">
                  <Link to={`/wallet/${w.address}`} className="text-sentinel-accent hover:underline">
                    {shortAddress(w.address)}
                  </Link>
                  {w.label && <span className="ml-2 rounded bg-red-400/15 px-1.5 text-xs text-red-300">{w.label}</span>}
                </td>
                <td className="px-3 py-2">{w.info_score.toFixed(1)}</td>
                <td className="px-3 py-2">{w.suspicious_score.toFixed(2)}</td>
                <td className="px-3 py-2">{w.forensic_score.toFixed(2)}</td>
                <td className="px-3 py-2">{(w.roi_estimate * 100).toFixed(0)}%</td>
                <td className="px-3 py-2">{w.trades_count}</td>
                <td className="px-3 py-2">${Math.round(w.total_volume).toLocaleString('it-IT')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
