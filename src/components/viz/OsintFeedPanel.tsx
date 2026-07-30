import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useRange } from '../../context/RangeProvider'
import type { AlertRow } from '../../lib/types'
import { alertColor, alertLabel } from '../../lib/types'
import { ago } from '../../lib/format'

export default function OsintFeedPanel() {
  const { start, end } = useRange()
  const [leads, setLeads] = useState<AlertRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)

    async function fetchOsint() {
      const { data, error } = await supabase
        .from('alerts')
        .select('*')
        .in('alert_type', ['osint_lead', 'mixer_funding'])
        .gte('timestamp_ms', start)
        .lte('timestamp_ms', end)
        .order('timestamp_ms', { ascending: false })
        .limit(10)

      if (!active) return

      if (error) {
        setError(error.message)
      } else {
        setLeads(data as AlertRow[])
      }
      setLoading(false)
    }

    void fetchOsint()

    return () => { active = false }
  }, [start, end])

  return (
    <div className="border border-sentinel-border bg-sentinel-bg p-4 shadow-xl">
      <header className="mb-4 flex items-center justify-between border-b border-sentinel-border pb-2">
        <h2 className="text-xl font-black uppercase tracking-tighter text-slate-100" style={{ letterSpacing: '-0.05em' }}>
          LIVE INTEL FEED
        </h2>
        {loading && <span className="font-mono text-[10px] uppercase text-sentinel-accent animate-pulse">syncing...</span>}
      </header>

      {error ? (
        <div className="text-xs text-red-500 font-mono uppercase">ERROR: {error}</div>
      ) : leads.length === 0 ? (
        <div className="py-6 text-center font-mono text-[11px] uppercase tracking-widest text-slate-600">
          No active leads in window
        </div>
      ) : (
        <ul className="space-y-4">
          {leads.map((lead) => {
            const payload = lead.payload || {}
            const title = String(payload.title || lead.market_title || 'Unknown Subject')
            const source = String(payload.source || 'Anonymous Intel')
            const confidence = typeof payload.confidence_score === 'number' ? Math.round(payload.confidence_score * 100) : null
            const url = String(payload.news_url || payload.url || '')

            return (
              <li key={lead.id} className="group relative border-l-4 pl-3 py-1 transition-all hover:bg-white/[0.02]" style={{ borderColor: alertColor(lead.alert_type) }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-[9px] font-bold uppercase tracking-widest px-1 border" style={{ color: alertColor(lead.alert_type), borderColor: alertColor(lead.alert_type) }}>
                    {alertLabel(lead.alert_type)}
                  </span>
                  <span className="font-mono text-[9px] uppercase text-slate-500">
                    {ago(lead.timestamp_ms)}
                  </span>
                  {confidence !== null && (
                    <span className="ml-auto font-mono text-[9px] text-slate-400">
                      CFD: {confidence}%
                    </span>
                  )}
                </div>
                
                <h3 className="text-sm font-semibold text-slate-200 uppercase leading-snug">
                  {title}
                </h3>
                
                <div className="mt-2 flex items-center gap-3">
                  <span className="font-mono text-[10px] text-slate-400">SRC: {source}</span>
                  {url && url.startsWith('http') && (
                    <a href={url} target="_blank" rel="noreferrer" className="font-mono text-[10px] text-[#1E40AF] hover:text-blue-400 hover:underline uppercase transition-colors">
                      [READ SOURCE]
                    </a>
                  )}
                  {lead.wallet_address && (
                    <span className="font-mono text-[10px] text-sentinel-accent ml-auto">
                      {lead.wallet_address.slice(0, 6)}...{lead.wallet_address.slice(-4)}
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
