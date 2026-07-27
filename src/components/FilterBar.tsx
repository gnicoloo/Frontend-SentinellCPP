import type { ReactNode } from 'react'
import { useRange } from '../context/RangeProvider'
import { RANGES } from '../lib/range'

interface Props {
  title: string
  /** Extra dimension filters -- they sit in the same row, never inside a card. */
  children?: ReactNode
  right?: ReactNode
  /** Hide the range presets on views that are not time-scoped. */
  showRange?: boolean
}

/**
 * One filter row above everything it scopes. Date range first: it is the
 * control every reader reaches for.
 */
export default function FilterBar({ title, children, right, showRange = true }: Props) {
  const { key, setKey, refresh, start, end } = useRange()

  return (
    <div className="sticky top-0 z-10 -mx-2 mb-3 border-b border-sentinel-border bg-sentinel-bg/95 px-2 pb-2 backdrop-blur md:-mx-4 md:px-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-1">
        <h2 className="font-heading text-sm font-bold uppercase tracking-widest text-sentinel-accent">{title}</h2>

        {showRange && (
          <>
            <div className="flex border border-sentinel-border" role="group" aria-label="Time range">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setKey(r.key)}
                  aria-pressed={key === r.key}
                  className={`px-2 py-1 text-[10px] font-mono uppercase tracking-wider transition-colors ${
                    key === r.key
                      ? 'bg-sentinel-accent/15 text-sentinel-accent'
                      : 'text-slate-500 hover:bg-white/5 hover:text-slate-200'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <span className="hidden text-[10px] font-mono text-slate-600 lg:inline">
              {new Date(start).toLocaleString('it-IT')} → {new Date(end).toLocaleString('it-IT')}
            </span>
          </>
        )}

        {children}

        <div className="ml-auto flex items-center gap-2">
          {right}
          <button
            type="button"
            onClick={refresh}
            title="Reload the current slice"
            className="border border-sentinel-border px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-slate-500 transition-colors hover:text-slate-200"
          >
            ⟳ SYNC
          </button>
        </div>
      </div>
    </div>
  )
}
