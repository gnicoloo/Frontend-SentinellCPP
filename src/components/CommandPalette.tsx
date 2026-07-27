import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

interface Command {
  code: string
  label: string
  hint: string
  to: string
}

/** Terminal-style mnemonics: type the code, hit GO. */
const COMMANDS: Command[] = [
  { code: 'DB', label: 'Dashboard', hint: 'market overview / live tape', to: '/' },
  { code: 'AL', label: 'Alert Explorer', hint: 'query + export the alert log', to: '/alerts' },
  { code: 'WL', label: 'Wallet Screener', hint: 'rank + filter the registry', to: '/wallets' },
  { code: 'CG', label: 'Cluster Graph', hint: 'co-trading network', to: '/clusters' },
]

const isAddress = (q: string) => /^0x[0-9a-fA-F]{6,}$/.test(q.trim())

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
        return
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) {
      setQuery('')
      setCursor(0)
      // Focus after the dialog paints, otherwise the caret lands nowhere.
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const results = useMemo<Command[]>(() => {
    const q = query.trim()
    if (isAddress(q)) {
      return [{ code: 'GO', label: `Wallet ${q.slice(0, 10)}…`, hint: 'open forensic profile', to: `/wallet/${q.toLowerCase()}` }]
    }
    const needle = q.toLowerCase()
    const matches = COMMANDS.filter(
      (c) => !needle || c.code.toLowerCase().startsWith(needle) || c.label.toLowerCase().includes(needle),
    )
    if (q && matches.length === 0) {
      return [{ code: 'SRCH', label: `Search alerts for "${q}"`, hint: 'market title contains', to: `/alerts?market=${encodeURIComponent(q)}` }]
    }
    return matches
  }, [query])

  const run = (cmd: Command | undefined) => {
    if (!cmd) return
    navigate(cmd.to)
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 border border-sentinel-border px-2 py-1.5 text-left text-[10px] font-mono uppercase tracking-wider text-slate-600 transition-colors hover:border-sentinel-accent/60 hover:text-slate-300"
      >
        <span className="text-sentinel-accent">{'>'}</span>
        <span>command</span>
        <kbd className="ml-auto border border-sentinel-border px-1 text-[9px] text-slate-600">CTRL K</kbd>
      </button>
    )
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/80 p-4 pt-[12vh]"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-label="Command line"
        className="w-full max-w-lg border border-sentinel-accent/60 bg-sentinel-bg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-sentinel-border px-3 py-2">
          <span className="font-mono text-sm text-sentinel-accent">{'>'}</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setCursor(0) }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(results.length - 1, c + 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)) }
              if (e.key === 'Enter') { e.preventDefault(); run(results[cursor]) }
            }}
            placeholder="DB · AL · WL · CG · 0xADDRESS · free text"
            className="w-full bg-transparent font-mono text-sm text-slate-100 outline-none placeholder:text-slate-700"
          />
          <kbd className="shrink-0 border border-sentinel-border px-1 text-[9px] font-mono text-slate-600">ESC</kbd>
        </div>

        <ul className="max-h-72 overflow-auto">
          {results.length === 0 && (
            <li className="px-3 py-3 font-mono text-[10px] uppercase text-slate-600">no match</li>
          )}
          {results.map((c, i) => (
            <li key={c.code + c.to}>
              <button
                type="button"
                onMouseEnter={() => setCursor(i)}
                onClick={() => run(c)}
                className={`flex w-full items-baseline gap-3 px-3 py-2 text-left transition-colors ${
                  i === cursor ? 'bg-sentinel-accent/10' : ''
                }`}
              >
                <span className="w-10 shrink-0 font-mono text-[11px] font-bold text-sentinel-accent">{c.code}</span>
                <span className="text-xs text-slate-200">{c.label}</span>
                <span className="ml-auto truncate font-mono text-[10px] text-slate-600">{c.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
