import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { INK, STATUS } from '../../lib/theme'
import { binize, type Bin } from '../../lib/stats'

interface Props {
  values: number[]
  bins?: number
  color: string
  height?: number
  /** Formats a bin edge for the axis and the tooltip. */
  format?: (v: number) => string
  /** Highlights the bin containing this value (the selected row / threshold). */
  marker?: number | null
  markerLabel?: string
}

/**
 * Cross-sectional shape of one metric. A single series, so it carries no
 * legend -- the panel title names what is plotted. The marked bin uses a
 * status token plus a printed label, never color alone.
 */
export default function Histogram({
  values, bins = 24, color, height = 96, format = (v) => v.toFixed(1), marker, markerLabel,
}: Props) {
  const data = useMemo(() => binize(values, bins), [values, bins])
  const markedIndex = useMemo(() => {
    if (marker === null || marker === undefined) return -1
    return data.findIndex((b, i) => marker >= b.x0 && (marker < b.x1 || i === data.length - 1))
  }, [data, marker])

  if (data.length === 0) {
    return <p className="px-3 py-6 text-center font-mono text-[10px] uppercase text-slate-600">no population</p>
  }

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }} barCategoryGap="8%">
          <CartesianGrid stroke={INK.grid} vertical={false} />
          <XAxis
            dataKey="x0"
            tickFormatter={(v: number) => format(v)}
            interval={Math.max(0, Math.ceil(data.length / 6) - 1)}
            stroke={INK.axis}
            tick={{ fill: INK.muted, fontSize: 9, fontFamily: 'monospace' }}
            tickLine={false}
            axisLine={{ stroke: INK.axis }}
          />
          <YAxis
            allowDecimals={false}
            width={28}
            stroke={INK.axis}
            tick={{ fill: INK.muted, fontSize: 9, fontFamily: 'monospace' }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            isAnimationActive={false}
            cursor={{ fill: 'rgba(226,232,240,0.06)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const b = payload[0].payload as Bin
              return (
                <div className="border border-sentinel-border bg-sentinel-bg px-2 py-1.5 shadow-xl">
                  <p className="num text-[11px] font-semibold text-slate-100">{b.count} wallets</p>
                  <p className="font-mono text-[10px] text-slate-400">
                    {format(b.x0)} – {format(b.x1)}
                  </p>
                </div>
              )
            }}
          />
          <Bar dataKey="count" stroke={INK.panel} strokeWidth={2} maxBarSize={24} radius={[2, 2, 0, 0]} isAnimationActive={false}>
            {data.map((_, i) => (
              <Cell key={i} fill={i === markedIndex ? STATUS.warning : color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {markedIndex >= 0 && (
        <p className="px-1 pt-1 font-mono text-[9px] uppercase tracking-wider" style={{ color: STATUS.warning }}>
          ■ {markerLabel ?? 'selection'} · bin {format(data[markedIndex].x0)}–{format(data[markedIndex].x1)}
        </p>
      )}
    </div>
  )
}
