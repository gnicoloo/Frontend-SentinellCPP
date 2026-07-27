import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRange } from '../context/RangeProvider'
import { STATUS } from '../lib/theme'
import { ago } from '../lib/format'

interface SyncRow {
  source_table: string
  last_rowid: number
  synced_at: string
}

/**
 * Real data freshness, read from `last_sync`. A surveillance view that cannot
 * say how stale it is invites the worst error there is: reading an empty chart
 * as "nothing is happening" when the sync has simply stopped. The staleness is
 * measured against the OLDEST bookmark, because one lagging source table is
 * enough to make the picture wrong.
 */
export default function SyncStatus({ compact = false }: { compact?: boolean }) {
  const { nonce } = useRange()
  const [rows, setRows] = useState<SyncRow[] | null>(null)

  useEffect(() => {
    let cancelled = false
    void supabase
      .from('last_sync')
      .select('source_table, last_rowid, synced_at')
      .then(({ data }) => {
        if (!cancelled) setRows((data as SyncRow[]) ?? [])
      })
    return () => { cancelled = true }
  }, [nonce])

  if (rows === null) {
    return <Badge color={STATUS.warning} glyph="◌" label="sync…" title="reading last_sync" compact={compact} />
  }
  if (rows.length === 0) {
    return (
      <Badge
        color={STATUS.critical}
        glyph="✕"
        label="no sync"
        title="last_sync is empty — the sync script has never run against this database"
        compact={compact}
      />
    )
  }

  const oldest = Math.min(...rows.map((r) => new Date(r.synced_at).getTime()))
  const age = Date.now() - oldest
  const stale = rows
    .filter((r) => new Date(r.synced_at).getTime() === oldest)
    .map((r) => r.source_table)
    .join(', ')

  const { color, glyph, label } =
    age < 5 * 60_000 ? { color: STATUS.good, glyph: '●', label: `live · ${ago(oldest)}` }
    : age < 30 * 60_000 ? { color: STATUS.warning, glyph: '▲', label: `lagging · ${ago(oldest)}` }
    : { color: STATUS.critical, glyph: '✕', label: `stale · ${ago(oldest)}` }

  return (
    <Badge
      color={color}
      glyph={glyph}
      label={label}
      title={`oldest bookmark: ${stale} at ${new Date(oldest).toLocaleString('it-IT')} · ${rows.length} source tables`}
      compact={compact}
    />
  )
}

/** Status never rests on hue: the glyph and the word carry it too. */
function Badge({
  color, glyph, label, title, compact,
}: { color: string; glyph: string; label: string; title: string; compact: boolean }) {
  return (
    <span
      title={title}
      className={`flex items-center gap-1.5 font-mono uppercase tracking-wider ${
        compact ? 'text-[9px]' : 'text-[10px]'
      }`}
    >
      <span style={{ color }}>{glyph}</span>
      <span className="text-slate-500">{label}</span>
    </span>
  )
}
