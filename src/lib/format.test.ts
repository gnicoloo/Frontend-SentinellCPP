import { describe, expect, it } from 'vitest'
import {
  ago, changeRatio, compact, duration, ordinal, pct, percentileOf, signedPct, usd,
} from './format'

describe('compact', () => {
  it('rende i valori sotto 10k per esteso, con separatore', () => {
    expect(compact(0)).toBe('0')
    expect(compact(1284)).toBe('1,284')
    expect(compact(9999)).toBe('9,999')
  })

  it('passa a K/M/B alle soglie', () => {
    // La soglia K è 1e4, non 1e3: 9.999 resta per esteso.
    expect(compact(10_000)).toBe('10.0K')
    expect(compact(1_000_000)).toBe('1.0M')
    expect(compact(1_000_000_000)).toBe('1.0B')
  })

  it('mantiene il segno sui negativi', () => {
    expect(compact(-1284)).toBe('-1,284')
    expect(compact(-2_500_000)).toBe('-2.5M')
  })

  it('degrada a em dash su null/undefined/NaN', () => {
    expect(compact(null)).toBe('—')
    expect(compact(undefined)).toBe('—')
    expect(compact(NaN)).toBe('—')
  })
})

describe('usd', () => {
  it('antepone il simbolo alla forma compatta', () => {
    expect(usd(1284)).toBe('$1,284')
    expect(usd(2_500_000)).toBe('$2.5M')
  })

  it('non stampa "$—" ma solo em dash quando manca il valore', () => {
    expect(usd(null)).toBe('—')
    expect(usd(NaN)).toBe('—')
  })
})

describe('pct / signedPct', () => {
  it('converte la frazione in percentuale', () => {
    expect(pct(0)).toBe('0%')
    expect(pct(0.5)).toBe('50%')
    expect(pct(-0.25)).toBe('-25%')
    expect(pct(0.1234, 2)).toBe('12.34%')
  })

  it('signedPct porta la direzione in un glifo, mai nel solo colore', () => {
    expect(signedPct(0.5)).toBe('▲ 50%')
    expect(signedPct(-0.5)).toBe('▼ 50%')
    expect(signedPct(0)).toBe('= 0%')
  })
})

describe('changeRatio', () => {
  it('calcola la variazione relativa', () => {
    expect(changeRatio(150, 100)).toBeCloseTo(0.5)
    expect(changeRatio(50, 100)).toBeCloseTo(-0.5)
  })

  it('restituisce null quando il periodo precedente era vuoto', () => {
    // È il caso che rendeva i delta della Dashboard privi di senso quando la
    // finestra precedente veniva troncata a zero: "null" significa
    // "incalcolabile", e a schermo non deve diventare "+∞%".
    expect(changeRatio(10, 0)).toBeNull()
  })

  it('tratta 0 su 0 come nessuna variazione, non come incalcolabile', () => {
    expect(changeRatio(0, 0)).toBe(0)
  })
})

describe('duration', () => {
  it('fa fluttuare l\'unità con la grandezza', () => {
    expect(duration(5_000)).toBe('5.0s')
    expect(duration(45_000)).toBe('45s')
    expect(duration(600_000)).toBe('10m')
    expect(duration(7_200_000)).toBe('2.0h')
  })

  it('gestisce zero e valori assenti', () => {
    expect(duration(0)).toBe('0.0s')
    expect(duration(null)).toBe('—')
    expect(duration(NaN)).toBe('—')
  })
})

describe('ago', () => {
  it('sceglie l\'unità in base alla distanza da adesso', () => {
    const now = Date.now()
    expect(ago(now - 30_000)).toBe('30s')
    expect(ago(now - 5 * 60_000)).toBe('5m')
    expect(ago(now - 3 * 3600_000)).toBe('3h')
    expect(ago(now - 2 * 86_400_000)).toBe('2d')
  })

  it('non produce età negative per timestamp nel futuro', () => {
    expect(ago(Date.now() + 60_000)).toBe('0s')
  })
})

describe('percentileOf', () => {
  const pop = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

  it('colloca il valore nella popolazione ordinata', () => {
    expect(percentileOf(5, pop)).toBeCloseTo(0.5)
    expect(percentileOf(10, pop)).toBeCloseTo(1)
  })

  it('gestisce gli estremi fuori scala', () => {
    expect(percentileOf(-100, pop)).toBe(0)
    expect(percentileOf(1000, pop)).toBe(1)
  })

  it('restituisce 0 su popolazione vuota invece di NaN', () => {
    // Capita davvero: la pagina wallet calcola percentili prima che i peer
    // siano arrivati, e un NaN qui finirebbe stampato come "NaNth pctl".
    expect(percentileOf(42, [])).toBe(0)
  })

  it('su un solo elemento distingue sopra e sotto', () => {
    expect(percentileOf(1, [5])).toBe(0)
    expect(percentileOf(5, [5])).toBe(1)
    expect(percentileOf(9, [5])).toBe(1)
  })

  it('conta i duplicati come tutti inferiori-o-uguali', () => {
    expect(percentileOf(2, [1, 2, 2, 2, 3])).toBeCloseTo(0.8)
  })
})

describe('ordinal', () => {
  it('usa i suffissi inglesi corretti', () => {
    expect(ordinal(1)).toBe('1st')
    expect(ordinal(2)).toBe('2nd')
    expect(ordinal(3)).toBe('3rd')
    expect(ordinal(4)).toBe('4th')
    expect(ordinal(83)).toBe('83rd')
  })

  it('tratta l\'eccezione 11/12/13', () => {
    expect(ordinal(11)).toBe('11th')
    expect(ordinal(12)).toBe('12th')
    expect(ordinal(13)).toBe('13th')
    expect(ordinal(111)).toBe('111th')
  })

  it('arrotonda i frazionari', () => {
    expect(ordinal(82.6)).toBe('83rd')
  })
})
