// Costanti e helper per l'interazione diretta con i contratti Polygon.
//
// Questa parte dell'app non passa dal CLOB off-chain di Polymarket: parla solo
// con il Conditional Token Framework e con USDC.e. Gli indirizzi sono fissi e
// non configurabili di proposito -- un indirizzo di contratto che arriva da una
// env var è un vettore di phishing, non una feature.

import { formatUnits, parseUnits, type Address, type Hex } from 'viem'

/** Polygon PoS. Ogni scrittura è bloccata su qualsiasi altra rete. */
export const POLYGON_CHAIN_ID = 137

/** USDC.e (bridged) -- il collaterale usato dai mercati Polymarket. */
export const USDC_ADDRESS: Address = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'

/** Gnosis ConditionalTokens, deploy Polymarket su Polygon. */
export const CTF_ADDRESS: Address = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045'

/**
 * USDC ha 6 decimali, e i token condizionali ereditano la stessa granularità:
 * 1 unità di collaterale splitta in 1 unità per lato. Quindi la stessa scala
 * vale per gli importi di split, merge e per i saldi ERC1155.
 */
export const USDC_DECIMALS = 6

/** Posizione non annidata: nessuna condizione padre. */
export const ROOT_COLLECTION_ID: Hex = `0x${'0'.repeat(64)}`

/**
 * Mercato binario: index set 0b01 = primo esito, 0b10 = secondo. La partizione
 * `[1, 2]` copre tutti gli slot, che è la condizione perché split e merge
 * siano ammessi dal contratto.
 */
export const BINARY_PARTITION = [1n, 2n] as const

/** Etichette per lato, nell'ordine degli index set qui sopra. */
export const OUTCOME_LABELS = ['SÌ (index set 1)', 'NO (index set 2)'] as const

export interface KnownMarket {
  /** conditionId a 32 byte, come registrato sul CTF. */
  conditionId: Hex
  label: string
}

/**
 * Segnaposto per la tendina, NON conditionId verificati on-chain: servono solo
 * a mostrare la forma del dato e a dare qualcosa su cui cliccare al primo
 * avvio. Vanno sostituiti con ID reali presi da Polymarket / Polygonscan.
 *
 * Non c'è rischio di sbagliare in silenzio: la pagina interroga
 * `getOutcomeSlotCount` per ogni conditionId selezionato e, se la condizione
 * non risulta registrata sul CTF, blocca le operazioni con un avviso esplicito.
 * Il campo resta comunque libero e accetta qualsiasi bytes32.
 *
 * Per popolarla dinamicamente, in ordine di costo:
 *   1. leggere `condition_id` / `market_slug` da Supabase (le tabelle
 *      `twap_patterns` e `alerts` li hanno già) e mostrare i mercati che il
 *      monitor sta osservando;
 *   2. interrogare il subgraph Polymarket per le condizioni ancora aperte.
 * In nessuno dei due casi cambia il resto della pagina: i positionId vengono
 * comunque derivati on-chain dal conditionId (vedi `useCtfPositions`).
 */
export const KNOWN_MARKETS: KnownMarket[] = [
  {
    label: 'ESEMPIO — sostituire con un conditionId reale (A)',
    conditionId: '0x0000000000000000000000000000000000000000000000000000000000000001',
  },
  {
    label: 'ESEMPIO — sostituire con un conditionId reale (B)',
    conditionId: '0x0000000000000000000000000000000000000000000000000000000000000002',
  },
]

/** bytes32 in forma esadecimale, con lo 0x. */
export function isConditionId(value: string): value is Hex {
  return /^0x[0-9a-fA-F]{64}$/.test(value)
}

/** Indirizzo EVM in forma esadecimale (non verifica il checksum). */
export function isAddress(value: string): value is Address {
  return /^0x[0-9a-fA-F]{40}$/.test(value)
}

/**
 * Importo leggibile -> unità intere del contratto. Ritorna `null` invece di
 * lanciare: il campo è un input di testo e l'utente digita mentre guarda.
 */
export function parseAmount(input: string, decimals = USDC_DECIMALS): bigint | null {
  const trimmed = input.trim().replace(',', '.')
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === '' || trimmed === '.') return null
  // Più cifre decimali di quante il token ne ha: parseUnits troncherebbe in
  // silenzio, e un troncamento silenzioso su un importo è esattamente il tipo
  // di sorpresa che non vogliamo davanti a una firma MetaMask.
  const [, frac = ''] = trimmed.split('.')
  if (frac.length > decimals) return null
  try {
    const value = parseUnits(trimmed, decimals)
    return value > 0n ? value : null
  } catch {
    return null
  }
}

/** Unità intere -> stringa leggibile, senza zeri di coda inutili. */
export function formatAmount(value: bigint | undefined, decimals = USDC_DECIMALS): string {
  if (value === undefined) return '—'
  const raw = formatUnits(value, decimals)
  return raw.includes('.') ? raw.replace(/\.?0+$/, '') : raw
}

/** 0x1234abcd… -> 0x1234…abcd */
export function shortHex(value: string, lead = 6, tail = 4): string {
  if (value.length <= lead + tail + 1) return value
  return `${value.slice(0, lead)}…${value.slice(-tail)}`
}

/**
 * Gli errori di viem/wagmi arrivano con lo stack RPC completo attaccato: utile
 * in console, illeggibile in un toast. Teniamo la prima riga, che è quella che
 * dice davvero cosa è successo ("User rejected the request", "insufficient
 * funds", il revert reason del contratto).
 */
export function txErrorMessage(error: unknown): string {
  if (!error) return 'Errore sconosciuto'
  const err = error as { shortMessage?: string; details?: string; message?: string }
  const text = err.shortMessage || err.details || err.message || String(error)
  const firstLine = text.split('\n')[0].trim()
  return firstLine.length > 180 ? `${firstLine.slice(0, 177)}…` : firstLine
}

/** Link all'esploratore per una transazione confermata. */
export function polygonscanTx(hash: string): string {
  return `https://polygonscan.com/tx/${hash}`
}
