import { useMemo, useState } from 'react'
import { INK } from '../../lib/theme'

export interface TimelineSpan {
  id: string
  /** Lane label -- spans sharing a lane stack on one row. */
  lane: string
  start: number
  end: number
  color: string
  /** Rendered in the tooltip, value first. */
  detail: { value: string; label: string }[]
  onClick?: () => void
}

interface Props {
  spans: TimelineSpan[]
  /** Window bounds, from the global range, so lanes share one axis. */
  start: number
  end: number
  tick: (ms: number) => string
  stamp: (ms: number) => string
  laneHeight?: number
  maxLanes?: number
}

const BAR = 9
const LABEL_W = 150

/** Tooltip anchor for a rendered bar, in the timeline's own coordinates. */
function locate(el: HTMLElement, top: number, span: TimelineSpan) {
  const box = (el.offsetParent as HTMLElement | null)?.getBoundingClientRect()
  const rect = el.getBoundingClientRect()
  return { x: rect.left - (box?.left ?? 0) + LABEL_W, y: top, span }
}

/**
 * Execution windows on a shared time axis -- one lane per market, so repeated
 * campaigns on the same book line up and concurrent slicing across books is
 * visible at a glance.
 *
 * Each bar spans a measured start->end. Nothing here reconstructs the
 * individual fills: the cadence would let you place them, but placing modelled
 * ticks beside measured ones would draw data that was never recorded.
 */
export default function ExecutionTimeline({
  spans, start, end, tick, stamp, laneHeight = 22, maxLanes = 14,
}: Props) {
  const [hover, setHover] = useState<{ x: number; y: number; span: TimelineSpan } | null>(null)

  const lanes = useMemo(() => {
    const map = new Map<string, TimelineSpan[]>()
    for (const s of spans) {
      if (!map.has(s.lane)) map.set(s.lane, [])
      map.get(s.lane)!.push(s)
    }
    // Busiest books first; the tail folds into a counted note rather than
    // scrolling forever.
    return [...map.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, maxLanes)
  }, [spans, maxLanes])

  const hiddenLanes = new Set(spans.map((s) => s.lane)).size - lanes.length
  const span = Math.max(1, end - start)
  const height = Math.max(laneHeight, lanes.length * laneHeight)

  // Six evenly spaced ticks; labels are placed inside the plot's own width.
  const ticks = Array.from({ length: 6 }, (_, i) => start + (span * i) / 5)
  const pctOf = (t: number) => ((Math.min(end, Math.max(start, t)) - start) / span) * 100

  if (spans.length === 0) {
    return (
      <p className="px-3 py-8 text-center font-mono text-[10px] uppercase text-slate-600">
        no execution windows in range
      </p>
    )
  }

  return (
    <div className="relative px-3 py-2">
      <div className="flex">
        <div className="shrink-0" style={{ width: LABEL_W }} />
        <div className="relative flex-1">
          {/* Gridlines: solid hairlines one step off the surface. */}
          <div className="absolute inset-0" style={{ height }}>
            {ticks.map((t, i) => (
              <span
                key={i}
                className="absolute top-0 w-px"
                style={{ left: `${pctOf(t)}%`, height, background: INK.grid }}
              />
            ))}
          </div>
        </div>
      </div>

      <ul style={{ height }} className="relative">
        {lanes.map(([lane, items], laneIndex) => (
          <li key={lane} className="absolute left-0 right-0 flex items-center" style={{ top: laneIndex * laneHeight, height: laneHeight }}>
            <span
              className="shrink-0 truncate pr-2 font-mono text-[9px] uppercase text-slate-500"
              style={{ width: LABEL_W }}
              title={lane}
            >
              {lane}
            </span>
            <span className="relative flex-1" style={{ height: laneHeight }}>
              {items.map((s) => {
                const left = pctOf(s.start)
                // A one-instant window would vanish; keep a minimum grabbable width.
                const width = Math.max(0.6, pctOf(s.end) - left)
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={s.onClick}
                    // Keyboard focus must place the readout exactly where hover
                    // does, so both paths measure the rendered bar rather than
                    // one using pixels and the other a percentage.
                    onPointerEnter={(e) => setHover(locate(e.currentTarget, laneIndex * laneHeight, s))}
                    onPointerLeave={() => setHover(null)}
                    onFocus={(e) => setHover(locate(e.currentTarget, laneIndex * laneHeight, s))}
                    onBlur={() => setHover(null)}
                    aria-label={`${s.lane} ${stamp(s.start)} to ${stamp(s.end)}`}
                    className="absolute focus:outline-none"
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      // The hit area is the full lane height; the painted bar is
                      // thinner and centred inside it.
                      top: 0,
                      height: laneHeight,
                      minWidth: 6,
                    }}
                  >
                    <span
                      className="block rounded-full"
                      style={{
                        background: s.color,
                        height: BAR,
                        marginTop: (laneHeight - BAR) / 2,
                        // A 2px surface ring keeps touching windows separate
                        // without drawing a contrasting border around them.
                        boxShadow: `0 0 0 2px ${INK.panel}`,
                      }}
                    />
                  </button>
                )
              })}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex">
        <div className="shrink-0" style={{ width: LABEL_W }} />
        <div className="relative h-4 flex-1 border-t" style={{ borderColor: INK.axis }}>
          {ticks.map((t, i) => (
            <span
              key={i}
              className="absolute top-0.5 font-mono text-[9px] text-slate-600"
              style={{
                left: `${pctOf(t)}%`,
                transform: i === 0 ? 'none' : i === ticks.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)',
              }}
            >
              {tick(t)}
            </span>
          ))}
        </div>
      </div>

      {hiddenLanes > 0 && (
        <p className="pt-3 font-mono text-[9px] uppercase text-slate-700">
          +{hiddenLanes} quieter book{hiddenLanes > 1 ? 's' : ''} not shown — narrow the range or filter
        </p>
      )}

      {hover && (
        <div
          className="pointer-events-none absolute z-20 border border-sentinel-border bg-sentinel-bg px-2 py-1.5 shadow-xl"
          style={{ left: Math.min(hover.x, 420), top: hover.y + 26 }}
        >
          <p className="mb-1 border-b border-sentinel-border pb-1 font-mono text-[10px] text-slate-400">
            {stamp(hover.span.start)} → {stamp(hover.span.end)}
          </p>
          <table>
            <tbody>
              {hover.span.detail.map((d) => (
                <tr key={d.label}>
                  <td className="num pr-2 text-right text-[11px] font-semibold text-slate-100">{d.value}</td>
                  <td className="whitespace-nowrap font-mono text-[10px] text-slate-400">{d.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
