import { describe, expect, it } from 'vitest'
import { formatAmount, isConditionId, parseAmount, shortHex, txErrorMessage } from './ctf'

// Questi helper stanno tra un campo di testo e una firma MetaMask: un errore
// qui non dà un grafico storto, dà una transazione dell'importo sbagliato.

describe('parseAmount', () => {
  it('converte nei 6 decimali di USDC', () => {
    expect(parseAmount('1')).toBe(1_000_000n)
    expect(parseAmount('0.5')).toBe(500_000n)
    expect(parseAmount('1234.567891')).toBe(1_234_567_891n)
  })

  it('accetta la virgola come separatore decimale', () => {
    expect(parseAmount('0,25')).toBe(250_000n)
  })

  it('rifiuta più decimali di quanti il token ne ha', () => {
    // parseUnits troncherebbe in silenzio: 1.0000001 diventerebbe 1.000000.
    expect(parseAmount('1.0000001')).toBeNull()
  })

  it('rifiuta zero, vuoto e input non numerici', () => {
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('  ')).toBeNull()
    expect(parseAmount('.')).toBeNull()
    expect(parseAmount('0')).toBeNull()
    expect(parseAmount('0.000000')).toBeNull()
    expect(parseAmount('-1')).toBeNull()
    expect(parseAmount('1e6')).toBeNull()
    expect(parseAmount('abc')).toBeNull()
  })

  it('rispetta un numero di decimali diverso', () => {
    expect(parseAmount('1', 18)).toBe(10n ** 18n)
    expect(parseAmount('1.5', 0)).toBeNull()
  })
})

describe('formatAmount', () => {
  it('torna alla forma leggibile senza zeri di coda', () => {
    expect(formatAmount(1_000_000n)).toBe('1')
    expect(formatAmount(1_500_000n)).toBe('1.5')
    expect(formatAmount(0n)).toBe('0')
  })

  it('distingue "saldo zero" da "saldo non ancora letto"', () => {
    expect(formatAmount(0n)).toBe('0')
    expect(formatAmount(undefined)).toBe('—')
  })
})

describe('isConditionId', () => {
  const valid = `0x${'a'.repeat(64)}`

  it('accetta solo bytes32 esadecimali con lo 0x', () => {
    expect(isConditionId(valid)).toBe(true)
    expect(isConditionId(valid.toUpperCase().replace('0X', '0x'))).toBe(true)
    expect(isConditionId('a'.repeat(64))).toBe(false)
    expect(isConditionId(`0x${'a'.repeat(63)}`)).toBe(false)
    expect(isConditionId(`0x${'a'.repeat(65)}`)).toBe(false)
    expect(isConditionId(`0x${'z'.repeat(64)}`)).toBe(false)
    expect(isConditionId('')).toBe(false)
  })
})

describe('shortHex', () => {
  it('accorcia solo quando serve', () => {
    expect(shortHex('0x1234567890abcdef')).toBe('0x1234…cdef')
    expect(shortHex('0x1234')).toBe('0x1234')
  })
})

describe('txErrorMessage', () => {
  it('preferisce shortMessage allo stack RPC completo', () => {
    const error = {
      shortMessage: 'User rejected the request.',
      message: 'User rejected the request.\nDetails: ...\nVersion: viem@2',
    }
    expect(txErrorMessage(error)).toBe('User rejected the request.')
  })

  it('ripiega sulla prima riga del messaggio', () => {
    expect(txErrorMessage(new Error('execution reverted\nRequest Arguments: ...'))).toBe(
      'execution reverted',
    )
  })

  it('non lascia passare un errore vuoto senza testo', () => {
    expect(txErrorMessage(null)).toBe('Errore sconosciuto')
    expect(txErrorMessage(undefined)).toBe('Errore sconosciuto')
  })
})
