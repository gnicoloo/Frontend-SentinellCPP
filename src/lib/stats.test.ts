import { describe, expect, it } from 'vitest'
import { binize, median, quantile } from './stats'

describe('binize', () => {
  it('distribuisce i valori in bin di uguale ampiezza', () => {
    const bins = binize([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 5)
    expect(bins).toHaveLength(5)
    expect(bins.map((b) => b.count)).toEqual([2, 2, 2, 2, 2])
  })

  it('fa cadere il massimo nell\'ultimo bin, non oltre', () => {
    // Senza il clamp, floor((max-min)/width) darebbe `bins`, cioè un indice
    // fuori array: il valore più alto sparirebbe dall\'istogramma.
    const bins = binize([0, 10], 5)
    expect(bins[bins.length - 1].count).toBe(1)
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(2)
  })

  it('regge una popolazione degenere (tutti i valori identici)', () => {
    const bins = binize([7, 7, 7], 4)
    expect(bins).toHaveLength(4)
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(3)
    // Larghezza finita anche con max === min, altrimenti sarebbe divisione per 0.
    expect(Number.isFinite(bins[0].x1 - bins[0].x0)).toBe(true)
  })

  it('restituisce array vuoto sui casi limite', () => {
    expect(binize([], 5)).toEqual([])
    expect(binize([1, 2, 3], 0)).toEqual([])
  })

  it('conserva sempre il totale dei valori', () => {
    const values = [-5, -1, 0, 0.5, 3, 12, 99]
    const total = binize(values, 6).reduce((s, b) => s + b.count, 0)
    expect(total).toBe(values.length)
  })
})

describe('median', () => {
  it('prende l\'elemento centrale su lunghezza dispari', () => {
    expect(median([3, 1, 2])).toBe(2)
  })

  it('su lunghezza pari prende il superiore dei due centrali', () => {
    // Non è la media aritmetica dei due centrali: la funzione sceglie un
    // valore realmente presente nella popolazione.
    expect(median([1, 2, 3, 4])).toBe(3)
  })

  it('non muta l\'array di ingresso', () => {
    const input = [3, 1, 2]
    median(input)
    expect(input).toEqual([3, 1, 2])
  })

  it('restituisce 0 sull\'array vuoto', () => {
    expect(median([])).toBe(0)
  })

  it('gestisce i negativi', () => {
    expect(median([-5, -1, -3])).toBe(-3)
  })
})

describe('quantile', () => {
  const pop = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

  it('restituisce il valore alla percentile richiesta', () => {
    expect(quantile(pop, 0)).toBe(1)
    expect(quantile(pop, 50)).toBe(6)
    expect(quantile(pop, 100)).toBe(10)
  })

  it('non sfora l\'ultimo indice a p=100', () => {
    expect(quantile([1, 2, 3], 100)).toBe(3)
  })

  it('accetta popolazioni non ordinate', () => {
    expect(quantile([10, 1, 5], 0)).toBe(1)
  })

  it('restituisce 0 sull\'array vuoto', () => {
    expect(quantile([], 50)).toBe(0)
  })

  it('su un solo elemento restituisce sempre quello', () => {
    expect(quantile([42], 0)).toBe(42)
    expect(quantile([42], 99)).toBe(42)
  })
})
