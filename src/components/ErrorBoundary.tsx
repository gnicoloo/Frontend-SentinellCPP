import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

/**
 * Rete di sicurezza per gli errori di rendering.
 *
 * Le pagine fanno molti cast non verificati a runtime (`data as WalletRow[]`)
 * su risposte Supabase: una riga malformata o un drift dello schema diventa
 * un'eccezione durante il render, e senza boundary React smonta l'intero
 * albero -- schermo bianco, nessun modo di recuperare se non ricaricare a mano.
 *
 * Deve restare una classe: non esiste equivalente hook di componentDidCatch.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Lo stack resta in console per il debug. All'utente non va esposto:
    // i messaggi di errore possono contenere frammenti di query o di dati.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="flex min-h-screen items-center justify-center bg-sentinel-bg p-4">
        <div className="w-full max-w-md border border-sentinel-border bg-sentinel-panel p-6">
          <h1 className="font-heading text-sm font-bold uppercase tracking-widest text-sentinel-destructive">
            Qualcosa è andato storto
          </h1>
          <p className="mt-2 font-mono text-[11px] leading-relaxed text-slate-400">
            La vista si è interrotta durante il rendering. Ricarica la pagina per
            riprendere; se l'errore si ripete, il dettaglio tecnico è nella
            console del browser.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 w-full bg-sentinel-accent px-3 py-2 font-mono text-xs font-bold uppercase tracking-widest text-sentinel-bg transition-colors hover:bg-green-400"
          >
            Ricarica
          </button>
        </div>
      </div>
    )
  }
}
