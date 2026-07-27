import { useMemo } from 'react'
import { INK } from '../../lib/theme'

interface Props {
  values: number[]
  color: string
  width?: number
  height?: number
  /** Area wash under the line, at the 10% opacity a wash is allowed. */
  fill?: boolean
  /** Accessible summary -- the sparkline itself carries no labels by design. */
  label: string
}

/**
 * 2px line, round caps, an end marker with a 2px surface ring so it stays
 * legible where it crosses the line. No axis, no labels: a sparkline shows
 * shape, and the number it sits beside carries the value.
 */
export default function Sparkline({ values, color, width = 88, height = 22, fill, label }: Props) {
  const geom = useMemo(() => {
    if (values.length < 2) return null
    const pad = 3
    const min = Math.min(...values)
    const max = Math.max(...values)
    const span = max - min || 1
    const stepX = (width - pad * 2) / (values.length - 1)
    const pts = values.map((v, i) => [
      pad + i * stepX,
      height - pad - ((v - min) / span) * (height - pad * 2),
    ] as const)
    return {
      line: pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' '),
      area: `M${pts[0][0].toFixed(1)} ${height} ` +
        pts.map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join(' ') +
        ` L${pts[pts.length - 1][0].toFixed(1)} ${height} Z`,
      end: pts[pts.length - 1],
    }
  }, [values, width, height])

  if (!geom) {
    return <span className="inline-block text-[10px] font-mono text-slate-600" style={{ width }}>—</span>
  }

  return (
    <svg width={width} height={height} role="img" aria-label={label} className="shrink-0 overflow-visible">
      {fill && <path d={geom.area} fill={color} fillOpacity={0.1} />}
      <path d={geom.line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={geom.end[0]} cy={geom.end[1]} r={2.5} fill={color} stroke={INK.panel} strokeWidth={2} />
    </svg>
  )
}
