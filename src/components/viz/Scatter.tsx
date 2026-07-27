import {
  CartesianGrid, Cell, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from 'recharts'
import { INK } from '../../lib/theme'

export interface ScatterPoint {
  x: number
  y: number
  /** Bubble area input. */
  z: number
  label: string
  color: string
  detail: { value: string; label: string }[]
}

interface Props {
  points: ScatterPoint[]
  xLabel: string
  yLabel: string
  xFormat?: (v: number) => string
  yFormat?: (v: number) => string
  height?: number
  /** Log-scale the x axis; cadence spans orders of magnitude. */
  logX?: boolean
}

/**
 * The signature plot: two measured axes, bubble area for a third measure.
 * Points carry a 2px surface ring so overlapping bubbles stay countable.
 *
 * Hit target: the tooltip fires on the painted shape, so the area floor below
 * is set to keep the smallest bubble grabbable rather than a pinpoint. It is
 * still short of the 24px ideal -- the values are all reachable in the panel's
 * table view, which is what keeps the plot from gating anything.
 */
export default function ScatterPlot({
  points, xLabel, yLabel, xFormat = (v) => String(v), yFormat = (v) => String(v), height = 240, logX,
}: Props) {
  if (points.length === 0) {
    return (
      <p className="px-3 py-10 text-center font-mono text-[10px] uppercase text-slate-600">
        no points in range
      </p>
    )
  }

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 10, right: 16, bottom: 20, left: 4 }}>
          <CartesianGrid stroke={INK.grid} />
          <XAxis
            type="number"
            dataKey="x"
            scale={logX ? 'log' : 'linear'}
            domain={logX ? ['dataMin', 'dataMax'] : ['dataMin', 'dataMax']}
            allowDataOverflow={false}
            tickFormatter={xFormat}
            stroke={INK.axis}
            tick={{ fill: INK.muted, fontSize: 9, fontFamily: 'monospace' }}
            tickLine={false}
            axisLine={{ stroke: INK.axis }}
            label={{ value: xLabel, position: 'insideBottom', offset: -12, fill: INK.muted, fontSize: 9, fontFamily: 'monospace' }}
          />
          <YAxis
            type="number"
            dataKey="y"
            tickFormatter={yFormat}
            width={40}
            stroke={INK.axis}
            tick={{ fill: INK.muted, fontSize: 9, fontFamily: 'monospace' }}
            tickLine={false}
            axisLine={false}
            label={{ value: yLabel, angle: -90, position: 'insideLeft', fill: INK.muted, fontSize: 9, fontFamily: 'monospace' }}
          />
          {/* Area, not radius: 160px^2 floor keeps the smallest point ~14px across. */}
          <ZAxis type="number" dataKey="z" range={[160, 620]} />
          <Tooltip
            isAnimationActive={false}
            cursor={{ stroke: INK.axis, strokeWidth: 1 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const p = payload[0].payload as ScatterPoint
              return (
                <div className="border border-sentinel-border bg-sentinel-bg px-2 py-1.5 shadow-xl">
                  <p className="mb-1 max-w-[220px] truncate border-b border-sentinel-border pb-1 font-mono text-[10px] text-slate-400">
                    {p.label}
                  </p>
                  <table>
                    <tbody>
                      {p.detail.map((d) => (
                        <tr key={d.label}>
                          <td className="num pr-2 text-right text-[11px] font-semibold text-slate-100">{d.value}</td>
                          <td className="whitespace-nowrap font-mono text-[10px] text-slate-400">{d.label}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }}
          />
          <Scatter data={points} isAnimationActive={false}>
            {points.map((p, i) => (
              <Cell key={i} fill={p.color} fillOpacity={0.75} stroke={INK.panel} strokeWidth={2} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}
