import type { TooltipProps } from 'recharts'
import { INK } from '../../lib/theme'

interface Extra {
  /** Renders the bucket start into the tooltip header. */
  stamp: (ms: number) => string
  /** Maps a dataKey to its display name. */
  nameOf: (key: string) => string
  /** Drop zero rows so a quiet bucket lists only what actually fired. */
  hideZero?: boolean
  unit?: string
}

/**
 * One tooltip, every series at that X. The value leads (high contrast) and the
 * series name follows -- the reader already has the series and wants the number.
 * Series identity is keyed by a short stroke, not a filled box.
 */
export default function ChartTooltip({
  active, payload, label, stamp, nameOf, hideZero = true, unit,
}: TooltipProps<number, string> & Extra) {
  if (!active || !payload?.length) return null

  const rows = payload.filter((p) => !hideZero || (p.value ?? 0) > 0)
  const total = payload.reduce((sum, p) => sum + (p.value ?? 0), 0)

  return (
    <div className="border border-sentinel-border bg-sentinel-bg px-2.5 py-2 shadow-xl">
      <p className="mb-1.5 border-b border-sentinel-border pb-1 text-[10px] font-mono text-slate-400">
        {typeof label === 'number' ? stamp(label) : String(label ?? '')}
      </p>
      {rows.length === 0 && <p className="text-[10px] font-mono text-slate-600">NO EVENTS</p>}
      <table className="w-full">
        <tbody>
          {rows.map((p) => (
            <tr key={String(p.dataKey)}>
              <td className="pr-2 align-middle">
                <span
                  className="inline-block h-0.5 w-3 align-middle"
                  style={{ background: p.color ?? INK.muted }}
                />
              </td>
              <td className="num pr-2 text-right text-[11px] font-semibold text-slate-100">
                {p.value?.toLocaleString('en-US')}
              </td>
              <td className="whitespace-nowrap text-[10px] font-mono text-slate-400">
                {nameOf(String(p.dataKey))}
              </td>
            </tr>
          ))}
          {rows.length > 1 && (
            <tr className="border-t border-sentinel-border/60">
              <td />
              <td className="num pr-2 pt-1 text-right text-[11px] font-semibold text-slate-100">
                {total.toLocaleString('en-US')}
              </td>
              <td className="pt-1 text-[10px] font-mono uppercase text-slate-500">{unit ?? 'total'}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
