import { describe, expect, it } from 'vitest'
import { bucketCount, densify, densifySeries, rangeDef, windows } from './range'

// NB: `bucketize` non esiste più. Il bucketing è stato spostato in Postgres
// (alert_buckets in schema_supabase.sql) perché contare righe già scaricate
// descriveva solo la fetta ammessa dal row cap. Qui si testa il contratto che
// ha preso il suo posto: la griglia dei bucket e la densificazione.

const HOUR = 3600_000
const DAY = 24 * HOUR

describe('rangeDef', () => {
  it('risolve ogni preset', () => {
    expect(rangeDef('1h').span).toBe(HOUR)
    expect(rangeDef('24h').span).toBe(DAY)
    expect(rangeDef('30d').span).toBe(30 * DAY)
  })

  it('ricade su 24h per una chiave sconosciuta', () => {
    // @ts-expect-error -- si verifica proprio il caso fuori dal tipo
    expect(rangeDef('nope').key).toBe('24h')
  })
})

describe('windows', () => {
  it('produce una finestra trailing più la precedente di pari ampiezza', () => {
    const now = 1_000_000_000_000
    const w = windows('24h', now)
    expect(w.end).toBe(now)
    expect(w.start).toBe(now - DAY)
    expect(w.prevEnd).toBe(w.start)
    expect(w.prevStart).toBe(now - 2 * DAY)
  })

  it('le due finestre hanno esattamente la stessa durata', () => {
    // Se divergessero, il delta "vs prior" confronterebbe periodi diversi.
    const w = windows('7d', 1_700_000_000_000)
    expect(w.end - w.start).toBe(w.prevEnd - w.prevStart)
  })
})

describe('bucketCount', () => {
  it('divide la finestra in bucket della larghezza del preset', () => {
    const def = rangeDef('24h') // bucket = 1h
    const end = 1_700_000_000_000
    expect(bucketCount(def, end - DAY, end)).toBe(24)
  })

  it('dà 30 colonne su 30 giorni', () => {
    const def = rangeDef('30d') // bucket = 1d
    const end = 1_700_000_000_000
    expect(bucketCount(def, end - 30 * DAY, end)).toBe(30)
  })

  it('non scende mai sotto 1 bucket', () => {
    // Una finestra degenere non deve produrre 0 colonne: sarebbe una
    // divisione per zero nel calcolo della larghezza.
    const def = rangeDef('30d')
    expect(bucketCount(def, 1000, 1000)).toBe(1)
    expect(bucketCount(def, 1000, 1001)).toBe(1)
  })
})

describe('densify', () => {
  const start = 0
  const end = 1000
  const count = 10

  it('emette una griglia densa con gli assenti a zero', () => {
    const out = densify([{ bucket_index: 3, key: 'a', n: 5 }], count, start, end)
    expect(out).toHaveLength(10)
    expect(out[3].a).toBe(5)
    expect(out[3].total).toBe(5)
    // Un'ora tranquilla deve leggersi come tranquilla, non come mancante.
    expect(out[0].total).toBe(0)
    expect(out[9].total).toBe(0)
  })

  it('ancora i bucket a [start, end], non a una griglia di orologio', () => {
    const out = densify([], count, start, end)
    expect(out[0].t).toBe(0)
    expect(out[1].t).toBe(100)
    expect(out[9].t).toBe(900)
  })

  it('somma più serie nello stesso bucket e nel totale', () => {
    const out = densify(
      [
        { bucket_index: 2, key: 'a', n: 3 },
        { bucket_index: 2, key: 'b', n: 4 },
      ],
      count, start, end,
    )
    expect(out[2].a).toBe(3)
    expect(out[2].b).toBe(4)
    expect(out[2].total).toBe(7)
  })

  it('accumula righe ripetute sulla stessa chiave', () => {
    const out = densify(
      [
        { bucket_index: 1, key: 'a', n: 2 },
        { bucket_index: 1, key: 'a', n: 3 },
      ],
      count, start, end,
    )
    expect(out[1].a).toBe(5)
    expect(out[1].total).toBe(5)
  })

  it('scarta indici fuori griglia invece di sfondare l\'array', () => {
    // Difesa contro un disallineamento fra il p_buckets mandato a Postgres e
    // il count usato qui: meglio perdere una colonna che rompere il render.
    const out = densify(
      [
        { bucket_index: -1, key: 'a', n: 9 },
        { bucket_index: 99, key: 'a', n: 9 },
      ],
      count, start, end,
    )
    expect(out).toHaveLength(10)
    expect(out.reduce((s, b) => s + b.total, 0)).toBe(0)
  })

  it('il totale della griglia eguaglia la somma delle righe', () => {
    // È l'invariante che fa combaciare il grafico con la KPI della stessa finestra.
    const rows = [
      { bucket_index: 0, key: 'a', n: 1 },
      { bucket_index: 4, key: 'b', n: 2 },
      { bucket_index: 9, key: 'a', n: 3 },
    ]
    const out = densify(rows, count, start, end)
    expect(out.reduce((s, b) => s + b.total, 0)).toBe(6)
  })
})

describe('densifySeries', () => {
  it('restituisce numeri semplici lunghi quanto la griglia', () => {
    const out = densifySeries([{ bucket_index: 2, n: 7 }], 5)
    expect(out).toEqual([0, 0, 7, 0, 0])
  })

  it('somma le ripetizioni', () => {
    const out = densifySeries([{ bucket_index: 1, n: 2 }, { bucket_index: 1, n: 3 }], 3)
    expect(out).toEqual([0, 5, 0])
  })

  it('ignora gli indici fuori intervallo', () => {
    const out = densifySeries([{ bucket_index: -1, n: 9 }, { bucket_index: 5, n: 9 }], 3)
    expect(out).toEqual([0, 0, 0])
  })

  it('su nessuna riga dà una serie di zeri, non un array vuoto', () => {
    // Le sparkline si aspettano una lunghezza fissa: un array vuoto le
    // farebbe collassare invece di disegnare una linea piatta.
    expect(densifySeries([], 4)).toEqual([0, 0, 0, 0])
  })
})
