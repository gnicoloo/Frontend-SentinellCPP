import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_RANGE, rangeDef, windows, type RangeDef, type RangeKey } from '../lib/range'

/** How often the trailing window rolls forward on its own. */
const AUTO_REFRESH_MS = 60_000

interface RangeValue {
  key: RangeKey
  def: RangeDef
  /** Bumped by the user hitting refresh; re-runs every loader below. */
  nonce: number
  start: number
  end: number
  prevStart: number
  prevEnd: number
  setKey: (key: RangeKey) => void
  refresh: () => void
}

const Ctx = createContext<RangeValue | null>(null)

/**
 * One range scopes every chart, stat and table in the view, so the numbers can
 * never disagree about which slice they describe.
 */
export function RangeProvider({ children }: { children: ReactNode }) {
  const [key, setKey] = useState<RangeKey>(DEFAULT_RANGE)
  const [nonce, setNonce] = useState(0)

  // The window is a trailing one, so it has to roll forward on its own or the
  // charts freeze while the tape keeps moving. Panels hold their previous
  // render at reduced opacity across the refetch, so nothing flashes.
  useEffect(() => {
    // A backgrounded tab still runs timers, so without this guard every tab
    // left open (very easy to do in dev) keeps re-fetching every page's full
    // query bundle once a minute, forever, even while nobody is looking at it.
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') setNonce((n) => n + 1)
    }, AUTO_REFRESH_MS)
    return () => clearInterval(id)
  }, [])

  // Anchored per (range, nonce) so a re-render never shifts the window mid-read.
  const value = useMemo<RangeValue>(() => {
    const now = Date.now()
    return {
      key,
      def: rangeDef(key),
      nonce,
      ...windows(key, now),
      setKey,
      refresh: () => setNonce((n) => n + 1),
    }
  }, [key, nonce])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useRange(): RangeValue {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useRange must be used inside <RangeProvider>')
  return ctx
}
