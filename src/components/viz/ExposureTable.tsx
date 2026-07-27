import { Link } from 'react-router-dom'
import MiniBar from './MiniBar'
import Signed from './Signed'
import { outcomeColor } from '../../lib/types'
import { compact, usd } from '../../lib/format'
import { INK } from '../../lib/theme'

export interface ExposureRow {
  /** Stable react key. */
  id: string
  market: string
  outcome: string | null
  /** Signed: positive long, negative short. */
  netContracts: number
  notional: number
  avgEntry: number
  /** Mark price; omitted for cluster legs, which carry no live mark. */
  last?: number | null
  unrealized?: number | null
  realized?: number | null
  /** Cluster legs report how many members hold the token. */
  holders?: number | null
  /** Where the market name links, if anywhere. */
  href?: string
}

interface Props {
  rows: ExposureRow[]
  emptyLabel?: string
  maxHeight?: number
  /** Shows the mark / unrealized columns. Cluster legs have neither. */
  showMark?: boolean
}

/**
 * The book: which contract, on which option, how big, at what price. Notional
 * gets an in-row bar scaled to the largest position so concentration is
 * visible without reading every number; the number is always printed too.
 */
export default function ExposureTable({ rows, emptyLabel = 'no open exposure', maxHeight = 300, showMark = true }: Props) {
  const maxNotional = Math.max(1, ...rows.map((r) => r.notional))

  return (
    <div className="overflow-auto" style={{ maxHeight }}>
      <table className="w-full whitespace-nowrap text-[10px]">
        <thead className="sticky top-0 border-b border-sentinel-border bg-sentinel-panel text-left font-mono text-[9px] uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-2 py-1.5 font-normal">Market</th>
            <th className="px-2 py-1.5 font-normal">Side</th>
            <th className="px-2 py-1.5 text-right font-normal">Net</th>
            <th className="px-2 py-1.5 text-right font-normal">Notional</th>
            <th className="px-2 py-1.5 text-right font-normal">Entry</th>
            {showMark && <th className="hidden px-2 py-1.5 text-right font-normal sm:table-cell">Mark</th>}
            {showMark && <th className="px-2 py-1.5 text-right font-normal">Unreal.</th>}
            {!showMark && <th className="px-2 py-1.5 text-right font-normal">Holders</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={showMark ? 7 : 6} className="px-2 py-4 text-center font-mono uppercase text-slate-600">
                {emptyLabel}
              </td>
            </tr>
          )}
          {rows.map((r) => {
            const long = r.netContracts >= 0
            return (
              <tr key={r.id} className="border-b border-sentinel-border/40 hover:bg-white/[0.03]">
                <td className="max-w-[180px] truncate px-2 py-1 text-slate-300" title={r.market}>
                  {r.href
                    ? <Link to={r.href} className="hover:text-sentinel-accent hover:underline">{r.market}</Link>
                    : r.market}
                </td>
                <td className="px-2 py-1">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2 w-2 shrink-0"
                      style={{ background: outcomeColor(r.outcome) }}
                    />
                    <span className="font-mono uppercase text-slate-300">{r.outcome || '—'}</span>
                    <span className="font-mono text-[9px]" style={{ color: INK.muted }}>
                      {long ? 'LONG' : 'SHORT'}
                    </span>
                  </span>
                </td>
                <td className="num px-2 py-1 text-right text-slate-200">
                  {long ? '' : '−'}{compact(Math.abs(r.netContracts))}
                </td>
                <td className="num px-2 py-1 text-right">
                  <span className="flex items-center justify-end gap-1.5">
                    <MiniBar
                      value={r.notional / maxNotional}
                      color={outcomeColor(r.outcome)}
                      width={28}
                      title={`notional ${usd(r.notional)}`}
                    />
                    <span className="text-slate-100">{usd(r.notional)}</span>
                  </span>
                </td>
                <td className="num px-2 py-1 text-right text-slate-400">{r.avgEntry.toFixed(3)}</td>
                {showMark && (
                  <td className="num hidden px-2 py-1 text-right text-slate-400 sm:table-cell">
                    {r.last !== null && r.last !== undefined ? r.last.toFixed(3) : '—'}
                  </td>
                )}
                {showMark && (
                  <td className="num px-2 py-1 text-right">
                    <Signed value={r.unrealized} format={(v) => usd(v)} />
                  </td>
                )}
                {!showMark && (
                  <td className="num px-2 py-1 text-right text-slate-400">{r.holders ?? '—'}</td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
