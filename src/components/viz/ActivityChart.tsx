import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import ChartTooltip from './ChartTooltip'
import { INK } from '../../lib/theme'
import type { Bucket } from '../../lib/range'

interface Series {
  key: string
  label: string
  color: string
}

interface Props {
  data: Bucket[]
  series: Series[]
  /** Bucket-start renderers from the active range. */
  tick: (ms: number) => string
  stamp: (ms: number) => string
  mode?: 'stack' | 'area'
  height?: number
  hidden?: Set<string>
  unit?: string
}

/**
 * The shared time plot. Stacked columns for composition over time, area for a
 * single intensity series. Gridlines are solid hairlines one step off the
 * surface; the 2px surface-colored gap between stacked segments is what
 * separates them -- never an outline in a contrasting color.
 */
export default function ActivityChart({
  data, series, tick, stamp, mode = 'stack', height = 200, hidden, unit,
}: Props) {
  const visible = series.filter((s) => !hidden?.has(s.key))
  const nameOf = (key: string) => series.find((s) => s.key === key)?.label ?? key
  // ~10 ticks max, so labels never collide on a 30-bucket window.
  const interval = Math.max(0, Math.ceil(data.length / 10) - 1)

  const axes = (
    <>
      <CartesianGrid stroke={INK.grid} vertical={false} />
      <XAxis
        dataKey="t"
        tickFormatter={(v: number) => tick(v)}
        interval={interval}
        stroke={INK.axis}
        tick={{ fill: INK.muted, fontSize: 9, fontFamily: 'monospace' }}
        tickLine={false}
        axisLine={{ stroke: INK.axis }}
        minTickGap={8}
      />
      <YAxis
        allowDecimals={false}
        width={34}
        stroke={INK.axis}
        tick={{ fill: INK.muted, fontSize: 9, fontFamily: 'monospace' }}
        tickLine={false}
        axisLine={false}
        tickFormatter={(v: number) => v.toLocaleString('en-US')}
      />
      <Tooltip
        content={<ChartTooltip stamp={stamp} nameOf={nameOf} unit={unit} />}
        cursor={{ fill: 'rgba(226,232,240,0.06)', stroke: 'none' }}
        isAnimationActive={false}
      />
    </>
  )

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        {mode === 'area' ? (
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            {axes}
            {visible.map((s) => (
              <Area
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2}
                fill={s.color}
                fillOpacity={0.1}
                isAnimationActive={false}
                activeDot={{ r: 4, fill: s.color, stroke: INK.panel, strokeWidth: 2 }}
              />
            ))}
          </AreaChart>
        ) : (
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="12%">
            {axes}
            {visible.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stackId="a"
                fill={s.color}
                stroke={INK.panel}
                strokeWidth={2}
                maxBarSize={24}
                isAnimationActive={false}
                radius={i === visible.length - 1 ? [2, 2, 0, 0] : undefined}
              />
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}
