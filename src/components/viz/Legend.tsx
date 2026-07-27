interface Item {
  key: string
  label: string
  color: string
}

interface Props {
  items: Item[]
  /** Marks the legend key: bars/areas get a rect, lines get a stroke. */
  mark?: 'rect' | 'line'
  /** Clicking a key isolates/restores that series. Colors never reshuffle. */
  hidden?: Set<string>
  onToggle?: (key: string) => void
}

/**
 * Always present for two or more series -- identity is never color-alone. A
 * single-series chart gets no legend: its title already names what is plotted.
 */
export default function Legend({ items, mark = 'rect', hidden, onToggle }: Props) {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {items.map((it) => {
        const off = hidden?.has(it.key) ?? false
        const content = (
          <>
            <span
              className="shrink-0"
              style={{
                background: it.color,
                width: mark === 'line' ? 12 : 8,
                height: mark === 'line' ? 2 : 8,
                opacity: off ? 0.3 : 1,
              }}
            />
            <span className={off ? 'text-slate-600 line-through' : 'text-slate-400'}>{it.label}</span>
          </>
        )
        return (
          <li key={it.key}>
            {onToggle ? (
              <button
                type="button"
                onClick={() => onToggle(it.key)}
                aria-pressed={!off}
                className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wide hover:text-slate-200"
              >
                {content}
              </button>
            ) : (
              <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wide">
                {content}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
