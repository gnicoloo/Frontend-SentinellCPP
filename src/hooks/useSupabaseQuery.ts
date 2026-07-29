import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react'

/**
 * Stato di una lettura, discriminato su `status`.
 *
 * `data` resta popolato anche durante un refetch e anche in errore: i pannelli
 * tengono il render precedente a opacità ridotta invece di sbiancare, e un
 * guasto momentaneo non deve cancellare figure ancora leggibili -- il banner
 * dice che sono vecchie. Solo in `success` il tipo garantisce `data` non nullo.
 */
export type QueryResult<T> =
  | { status: 'loading'; data: T | null; error: null; isLoading: true; refresh: () => void }
  | { status: 'success'; data: T; error: null; isLoading: false; refresh: () => void }
  | { status: 'error'; data: T | null; error: string; isLoading: false; refresh: () => void }

/**
 * Esegue `fetcher` quando cambiano le `deps` e ne centralizza loading, errore e
 * cancellazione.
 *
 * Prende una funzione async invece di un singolo builder perché quasi ogni
 * pagina legge più tabelle in un solo `Promise.all` (e la Dashboard in due fasi:
 * prima le entità top, poi le serie di quelle entità). Un hook per-query
 * costringerebbe a spezzare quelle dipendenze; così la forma del fetch resta
 * quella che era e cambia solo chi gestisce l'errore.
 *
 * Usa `unwrap()` dentro il fetcher perché gli errori PostgREST diventino
 * eccezioni e arrivino qui.
 */
export function useSupabaseQuery<T>(fetcher: () => Promise<T>, deps: DependencyList): QueryResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [nonce, setNonce] = useState(0)

  // Ogni run si prende un id: solo l'ultimo può scrivere sullo stato, così una
  // risposta lenta di una dep precedente non sovrascrive quella corrente.
  const runIdRef = useRef(0)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  useEffect(() => {
    const runId = ++runIdRef.current
    setIsLoading(true)
    void (async () => {
      try {
        const result = await fetcherRef.current()
        if (runId !== runIdRef.current) return
        setData(result)
        setError(null)
      } catch (e) {
        if (runId !== runIdRef.current) return
        // Lo stack resta in console per il debug, all'utente va solo il messaggio.
        // eslint-disable-next-line no-console
        console.error('[useSupabaseQuery]', e)
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (runId === runIdRef.current) setIsLoading(false)
      }
    })()
    return () => { runIdRef.current++ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  if (isLoading) return { status: 'loading', data, error: null, isLoading: true, refresh }
  if (error !== null) return { status: 'error', data, error, isLoading: false, refresh }
  return { status: 'success', data: data as T, error: null, isLoading: false, refresh }
}
