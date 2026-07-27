import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { shortAddress, type WalletRow } from '../lib/types'

type SortKey = 'info_score' | 'suspicious_score' | 'forensic_score' | 'total_volume' | 'trades_count' | 'roi_estimate'

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'info_score', label: 'INFO' },
  { key: 'suspicious_score', label: 'SUSP' },
  { key: 'forensic_score', label: 'FORENSIC' },
  { key: 'roi_estimate', label: 'ROI' },
  { key: 'trades_count', label: 'TX' },
  { key: 'total_volume', label: 'VOL ($)' },
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
      <div className="flex flex-wrap items-center justify-between border-b border-sentinel-border pb-2">
        <h2 className="text-sm font-bold font-heading text-sentinel-accent uppercase tracking-widest">WALLET_REGISTRY</h2>
        <input
          placeholder="SEARCH 0X..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ml-auto border border-sentinel-border bg-sentinel-bg px-2 py-1.5 font-mono text-xs outline-none focus:border-sentinel-accent"
        />
      </div>

      <div className="overflow-x-auto border border-sentinel-border bg-sentinel-panel">
        <table className="w-full text-xs font-mono whitespace-nowrap">
          <thead className="bg-sentinel-border/30 text-left text-[10px] uppercase tracking-wider text-slate-400 border-b border-sentinel-border">
            <tr>
              <th className="px-3 py-2 font-normal">Wallet</th>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  onClick={() => setSortKey(c.key)}
                  className={`cursor-pointer px-3 py-2 hover:text-slate-200 transition-colors font-normal ${sortKey === c.key ? 'text-sentinel-accent' : ''}`}
                >
                  {c.label} {sortKey === c.key ? '▼' : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">LOADING_REGISTRY...</td></tr>}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">NO_DATA (RUN SYNC SCRIPT)</td></tr>
            )}
            {rows.map((w) => (
              <tr key={w.address} className="border-b border-sentinel-border/50 hover:bg-sentinel-border/30 transition-colors">
                <td className="px-3 py-2 font-mono">
                  <Link to={`/wallet/${w.address}`} className="text-sentinel-accent hover:underline">
                    {shortAddress(w.address)}
                  </Link>
                  {w.label && <span className="ml-2 border border-sentinel-destructive px-1 text-[9px] text-sentinel-destructive">{w.label}</span>}
                </td>
                <td className="px-3 py-2">{w.info_score.toFixed(1)}</td>
                <td className="px-3 py-2 text-sentinel-destructive">{w.suspicious_score.toFixed(2)}</td>
                <td className="px-3 py-2 text-purple-400">{w.forensic_score.toFixed(2)}</td>
                <td className={`px-3 py-2 ${w.roi_estimate >= 0 ? 'text-sentinel-accent' : 'text-sentinel-destructive'}`}>{(w.roi_estimate * 100).toFixed(0)}%</td>
                <td className="px-3 py-2">{w.trades_count}</td>
                <td className="px-3 py-2 text-slate-300">{Math.round(w.total_volume).toLocaleString('en-US')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
