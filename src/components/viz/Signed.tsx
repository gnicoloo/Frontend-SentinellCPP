import { DELTA } from '../../lib/theme'

interface Props {
  value: number | null | undefined
  /** Renders the magnitude; receives the absolute value. */
  format: (abs: number) => string
  /** True when a negative number is the good outcome. */
  inverted?: boolean
  className?: string
}

/**
 * A signed figure -- P&L, ROI, a delta. The glyph carries the direction and
 * the color only reinforces it, so the sign survives CVD, grayscale print and
 * a screenshot pasted into a chat.
 */
export default function Signed({ value, format, inverted, className }: Props) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return <span className={`text-slate-600 ${className ?? ''}`}>—</span>
  }
  const up = value > 0
  const flat = value === 0
  const good = inverted ? !up : up
  const color = flat ? DELTA.flat : good ? DELTA.up : DELTA.down
  const glyph = flat ? '' : up ? '▲' : '▼'

  return (
    <span className={className} style={{ color }}>
      {glyph}{glyph ? ' ' : ''}{format(Math.abs(value))}
    </span>
  )
}
