import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY non impostate: copia .env.example in .env.local',
  )
}

export const supabase = createClient(url ?? '', anonKey ?? '')

/** La forma di ogni risposta PostgREST, sia builder che rpc(). */
interface PostgrestLike<T> {
  data: T | null
  error: { message: string } | null
}

/**
 * Srotola una risposta Supabase e LANCIA se `error` è valorizzato.
 *
 * Il motivo per cui esiste: il codice scriveva `const { data } = await ...` e
 * poi `data ?? []`, quindi un guasto (rete, RLS, drift dello schema) arrivava
 * a schermo identico a una tabella vuota. Su un tool forense è la lettura
 * peggiore possibile -- "non sta succedendo niente" quando la verità è "non
 * abbiamo letto niente". Lanciando, l'errore risale a useSupabaseQuery, che lo
 * trasforma in un banner invece che in un grafico piatto.
 */
export async function unwrap<T>(query: PromiseLike<PostgrestLike<T>>): Promise<T> {
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data as T
}

/** Come `unwrap`, ma tiene anche il totale di `{ count: 'exact' }`. */
export async function unwrapWithCount<T>(
  query: PromiseLike<PostgrestLike<T> & { count: number | null }>,
): Promise<{ rows: T; count: number }> {
  const { data, error, count } = await query
  if (error) throw new Error(error.message)
  return { rows: data as T, count: count ?? 0 }
}
