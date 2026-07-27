interface Props {
  /** 0..1 share of the row's track. */
  value: number
  color: string
  width?: number
  title?: string
}

/**
 * The in-row magnitude bar for leaderboards. One color per row-entity (never a
 * value ramp on nominal categories); the printed number beside it carries the
 * value, so the bar only has to show relative size.
 */
export default function MiniBar({ value, color, width = 56, title }: Props) {
  const pct = Math.min(100, Math.max(0, value * 100))
  return (
    <span
      className="inline-block h-1.5 shrink-0 align-middle"
      style={{ width, background: `${color}26` }}
      title={title}
      role="presentation"
    >
      <span className="block h-full" style={{ width: `${pct}%`, background: color }} />
    </span>
  )
}
