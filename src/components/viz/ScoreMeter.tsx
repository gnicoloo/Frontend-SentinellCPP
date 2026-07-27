import { ordinal, percentileOf } from '../../lib/format'
import { severityOf } from '../../lib/theme'

interface Props {
  label: string
  value: number
  max: number
  /** Ascending population of the same metric -- gives the value its rank. */
  population?: number[]
  /** Population value to mark on the track (usually the median). */
  benchmark?: number
  benchmarkLabel?: string
}

/**
 * A raw score with the cross-sectional context an analyst reads it against.
 * The fill carries severity; the unfilled track is the same hue at low
 * opacity, so state reads across the whole bar. The number is always printed,
 * so severity color never gates the value.
 */
export default function ScoreMeter({ label, value, max, population, benchmark, benchmarkLabel }: Props) {
  const t = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
  const { color, label: sev } = severityOf(t)
  const rank = population && population.length > 0 ? percentileOf(value, population) : null
  const markAt = benchmark !== undefined && max > 0 ? Math.min(1, Math.max(0, benchmark / max)) : null

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[10px] font-mono uppercase tracking-wider">
        <span className="text-slate-400">{label}</span>
        <span className="flex items-baseline gap-2">
          {rank !== null && (
            <span className="text-slate-500">{ordinal(rank * 100)} pctl</span>
          )}
          <span className="num font-semibold text-slate-100">
            {value.toFixed(2)}<span className="text-slate-600">/{max}</span>
          </span>
        </span>
      </div>

      <div className="relative mt-1 h-2" style={{ background: `${color}22` }}>
        <div className="h-full" style={{ width: `${t * 100}%`, background: color }} />
        {markAt !== null && (
          <span
            className="absolute top-[-2px] h-3 w-px bg-slate-300"
            style={{ left: `${markAt * 100}%` }}
            title={benchmarkLabel ?? `benchmark ${benchmark}`}
          />
        )}
      </div>

      <div className="mt-1 flex justify-between text-[9px] font-mono uppercase tracking-wider">
        <span style={{ color }}>■ {sev}</span>
        {markAt !== null && <span className="text-slate-600">| {benchmarkLabel ?? 'median'}</span>}
      </div>
    </div>
  )
}
