import { STATUS } from '../lib/theme'

/**
 * Una lettura fallita deve avere un aspetto diverso da una finestra tranquilla.
 * Senza questo, una query rotta e un intervallo davvero vuoto rendono entrambi
 * un grafico piatto -- e il grafico piatto è quello a cui si crede.
 *
 * Non è bloccante di proposito: i dati eventualmente già a schermo restano
 * navigabili, il banner dice solo che non sono aggiornati.
 */
export default function LoadError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 border-l-2 px-3 py-1.5"
      style={{ borderColor: STATUS.critical }}
    >
      <span className="font-mono text-[10px] uppercase tracking-wider" style={{ color: STATUS.critical }}>
        ⚠ Errore nel caricamento
      </span>
      <span className="min-w-0 flex-1 break-words font-mono text-[10px] text-slate-500">{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="border border-sentinel-border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-slate-400 transition-colors hover:text-slate-100"
        >
          Riprova
        </button>
      )}
    </div>
  )
}
