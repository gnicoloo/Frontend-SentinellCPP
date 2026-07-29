import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { STATUS } from '../lib/theme'

export type ToastKind = 'pending' | 'success' | 'error' | 'info'

export interface Toast {
  id: string
  kind: ToastKind
  title: string
  detail?: string
  /** Link opzionale in coda al messaggio (es. la tx su Polygonscan). */
  href?: string
  hrefLabel?: string
}

interface ToastApi {
  /** Apre un toast e ne ritorna l'id, così il chiamante può aggiornarlo. */
  push: (toast: Omit<Toast, 'id'>) => string
  /** Aggiorna un toast esistente: pending -> success/error senza farlo saltare. */
  update: (id: string, patch: Partial<Omit<Toast, 'id'>>) => void
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

/** Quanto resta a schermo un esito. I `pending` non scadono: li chiude l'esito. */
const TTL_MS: Record<ToastKind, number | null> = {
  pending: null,
  success: 8000,
  error: 12000,
  info: 6000,
}

const TONE: Record<ToastKind, { color: string; glyph: string }> = {
  // Il glifo non è decorazione: il colore da solo non basta a distinguere
  // "confermata" da "fallita" per chi non lo vede.
  pending: { color: STATUS.warning, glyph: '◴' },
  success: { color: STATUS.good, glyph: '✓' },
  error: { color: STATUS.critical, glyph: '✕' },
  info: { color: '#94a3b8', glyph: '·' },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const seq = useRef(0)
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  const schedule = useCallback((id: string, kind: ToastKind) => {
    const existing = timers.current.get(id)
    if (existing) clearTimeout(existing)
    const ttl = TTL_MS[kind]
    if (ttl === null) {
      timers.current.delete(id)
      return
    }
    timers.current.set(id, setTimeout(() => dismiss(id), ttl))
  }, [dismiss])

  const push = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `t${++seq.current}`
    setToasts((list) => [...list, { ...toast, id }])
    schedule(id, toast.kind)
    return id
  }, [schedule])

  const update = useCallback((id: string, patch: Partial<Omit<Toast, 'id'>>) => {
    setToasts((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)))
    if (patch.kind) schedule(id, patch.kind)
  }, [schedule])

  const api = useMemo<ToastApi>(() => ({ push, update, dismiss }), [push, update, dismiss])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-16 right-2 z-[60] flex w-[min(24rem,calc(100vw-1rem))] flex-col gap-1.5 md:bottom-3 md:right-3"
      >
        {toasts.map((t) => {
          const tone = TONE[t.kind]
          return (
            <div
              key={t.id}
              role={t.kind === 'error' ? 'alert' : 'status'}
              className="pointer-events-auto border-l-2 border-y border-r border-sentinel-border bg-sentinel-panel px-3 py-2 shadow-lg"
              style={{ borderLeftColor: tone.color }}
            >
              <div className="flex items-start gap-2">
                <span aria-hidden className="font-mono text-xs leading-5" style={{ color: tone.color }}>
                  {tone.glyph}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[11px] uppercase tracking-wider text-slate-200">{t.title}</p>
                  {t.detail && (
                    <p className="mt-0.5 break-words font-mono text-[10px] leading-relaxed text-slate-500">
                      {t.detail}
                    </p>
                  )}
                  {t.href && (
                    <a
                      href={t.href}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-1 inline-block font-mono text-[10px] uppercase tracking-wider text-sentinel-accent hover:underline"
                    >
                      {t.hrefLabel ?? 'Apri'} ↗
                    </a>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  aria-label="Chiudi notifica"
                  className="shrink-0 font-mono text-[10px] text-slate-600 hover:text-slate-300"
                >
                  ✕
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast va usato dentro <ToastProvider>')
  return ctx
}
