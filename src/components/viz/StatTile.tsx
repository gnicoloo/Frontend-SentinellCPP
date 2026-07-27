import Sparkline from './Sparkline'
import { DELTA } from '../../lib/theme'
import { signedPct } from '../../lib/format'

interface Props {
  label: string
  value: string
  /** Period-over-period ratio; null when the prior window had no base. */
  delta?: number | null
  /** Name of the comparison window, e.g. "vs prior 24H". */
  deltaLabel?: string
  /** True when a rising value is bad (alert counts, threat scores). */
  inverted?: boolean
  trend?: number[]
  /** Mark color for the sparkline -- identity, not status. */
  accent: string
  footnote?: string
}

/**
 * label / value / delta / trend. The value uses proportional figures: a large
 * standalone number reads loose with tabular digits.
 */
export default function StatTile({
  label, value, delta, deltaLabel, inverted, trend, accent, footnote,
}: Props) {
  const rising = delta !== null && delta !== undefined && delta !== 0
  const good = rising && (inverted ? (delta as number) < 0 : (delta as number) > 0)
  const deltaColor = !rising ? DELTA.flat : good ? DELTA.up : DELTA.down

  return (
    <div className="border-l-2 bg-sentinel-panel px-3 py-2" style={{ borderLeftColor: accent }}>
      <p className="truncate text-[10px] font-mono uppercase tracking-wider text-slate-500">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <p className="text-2xl font-semibold leading-none text-slate-100">{value}</p>
        {trend && trend.length > 1 && (
          <Sparkline values={trend} color={accent} label={`${label} trend`} fill />
        )}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5 text-[10px] font-mono">
        {delta !== undefined && (
          <span style={{ color: deltaColor }}>{delta === null ? 'NEW' : signedPct(delta)}</span>
        )}
        <span className="truncate text-slate-600">{footnote ?? deltaLabel}</span>
      </div>
    </div>
  )
}
