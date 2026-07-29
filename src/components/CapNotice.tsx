import { STATUS } from '../lib/theme'
import { compact } from '../lib/format'

interface Props {
  /** Righe effettivamente a schermo. */
  shown: number
  /** Tetto oltre il quale non si legge: se `shown` lo tocca, si sta troncando. */
  cap: number
  /** Totale reale, quando lo conosciamo (COUNT esatto lato server). */
  total?: number | null
  /** Cosa si sta contando: "alert", "nodi", "wallet"… */
  unit?: string
  /** Cosa può fare l'utente per vedere il resto. */
  hint?: string
}

/**
 * Il troncamento silenzioso è il difetto che ha fatto sembrare "solo oggi" i
 * grafici a 30 giorni: un tetto raggiunto non si distingue da un dataset che
 * finisce lì. Dove il tetto resta (le liste, il grafo), va detto a schermo.
 *
 * Non renderizza nulla finché il tetto non è davvero raggiunto, così non fa
 * rumore sulle istanze piccole.
 */
export default function CapNotice({ shown, cap, total = null, unit = 'righe', hint }: Props) {
  if (shown < cap) return null

  // Il totale esatto c'è solo dove la query lo chiede; senza, "almeno N".
  const scope = total !== null && total > shown
    ? `mostrati ${compact(shown)} di ${compact(total)} ${unit}`
    : `mostrati i primi ${compact(shown)} ${unit}`

  return (
    <p
      role="status"
      className="border-l-2 px-3 py-1.5 font-mono text-[10px] uppercase leading-relaxed text-slate-400"
      style={{ borderColor: STATUS.warning }}
    >
      <span style={{ color: STATUS.warning }}>⚠ Cap raggiunto</span>
      <span className="ml-2">{scope}</span>
      {hint && <span className="ml-2 text-slate-600">— {hint}</span>}
    </p>
  )
}
