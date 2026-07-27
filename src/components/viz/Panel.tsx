import { useId, useState, type ReactNode } from 'react'

export interface PanelTable {
  columns: string[]
  rows: (string | number)[][]
}

interface Props {
  title: string
  /** Short qualifier printed after the title in muted ink (units, window, n=). */
  meta?: string
  /** Right-hand slot in the title bar -- legends, links, counts. */
  actions?: ReactNode
  /**
   * The WCAG-clean twin. When present the panel grows a [TBL] toggle, so every
   * value a chart shows is reachable without hovering or seeing color.
   */
  table?: PanelTable
  /** Hold the previous render at reduced opacity during refetch -- no skeleton. */
  loading?: boolean
  className?: string
  children: ReactNode
}

export default function Panel({ title, meta, actions, table, loading, className, children }: Props) {
  const [showTable, setShowTable] = useState(false)
  const bodyId = useId()

  return (
    <section className={`flex min-w-0 flex-col border border-sentinel-border bg-sentinel-panel ${className ?? ''}`}>
      <header className="flex items-center gap-2 border-b border-sentinel-border px-3 py-1.5">
        <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-300">{title}</h3>
        {meta && <span className="truncate text-[10px] font-mono text-slate-500">{meta}</span>}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {actions}
          {table && (
            <button
              type="button"
              onClick={() => setShowTable((v) => !v)}
              aria-expanded={showTable}
              aria-controls={bodyId}
              className={`border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider transition-colors ${
                showTable
                  ? 'border-sentinel-accent text-sentinel-accent'
                  : 'border-sentinel-border text-slate-500 hover:text-slate-200'
              }`}
            >
              TBL
            </button>
          )}
        </div>
      </header>

      <div
        id={bodyId}
        className={`min-w-0 flex-1 transition-opacity duration-150 ${loading ? 'opacity-40' : 'opacity-100'}`}
      >
        {showTable && table ? <DataTable {...table} /> : children}
      </div>
    </section>
  )
}

function DataTable({ columns, rows }: PanelTable) {
  return (
    <div className="max-h-72 overflow-auto">
      <table className="w-full text-[10px] font-mono">
        <thead className="sticky top-0 bg-sentinel-panel text-left uppercase tracking-wider text-slate-500">
          <tr className="border-b border-sentinel-border">
            {columns.map((c, i) => (
              <th key={c} className={`px-3 py-1.5 font-normal ${i === 0 ? '' : 'text-right'}`}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={columns.length} className="px-3 py-4 text-center text-slate-600">NO ROWS</td></tr>
          )}
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-sentinel-border/40">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={`px-3 py-1 ${j === 0 ? 'text-slate-300' : 'num text-right text-slate-400'}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
