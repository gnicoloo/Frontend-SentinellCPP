import { useMemo } from 'react'
import { useReadContract, useReadContracts } from 'wagmi'
import type { Address, Hex } from 'viem'
import { ctfAbi } from '../abis/ctf'
import {
  BINARY_PARTITION,
  CTF_ADDRESS,
  OUTCOME_LABELS,
  POLYGON_CHAIN_ID,
  ROOT_COLLECTION_ID,
  USDC_ADDRESS,
} from '../lib/ctf'

export interface CtfPosition {
  conditionId: Hex
  /** 1 = primo esito, 2 = secondo. È anche l'argomento di `redeemPositions`. */
  indexSet: bigint
  label: string
  collectionId?: Hex
  /** Il token ID ERC1155 vero e proprio. */
  positionId?: bigint
  balance?: bigint
  /** Numeratore del payout per questo lato; definito solo a mercato risolto. */
  payoutNumerator?: bigint
}

export interface CtfCondition {
  conditionId: Hex
  /** 0 = la condizione non è mai stata preparata su questo CTF. */
  outcomeSlotCount?: bigint
  /** > 0 solo dopo che l'oracolo ha riportato l'esito. */
  payoutDenominator?: bigint
  registered: boolean
  resolved: boolean
  /** Gli index set che pagano, quando la condizione è risolta. */
  winningIndexSets: bigint[]
  positions: CtfPosition[]
}

/** Riga di `useReadContracts` in modalità `allowFailure` (il default). */
type ReadRow = { status: 'success'; result: unknown } | { status: 'failure'; error: unknown }

function bigIntOf(row: ReadRow | undefined): bigint | undefined {
  return row?.status === 'success' && typeof row.result === 'bigint' ? row.result : undefined
}

function hexOf(row: ReadRow | undefined): Hex | undefined {
  if (row?.status !== 'success') return undefined
  return typeof row.result === 'string' && row.result.startsWith('0x') ? (row.result as Hex) : undefined
}

const SIDES = BINARY_PARTITION.length

/**
 * Layout delle righe del round 1, per condizione. Tenerlo esplicito evita che
 * un giorno si aggiunga una lettura in cima e tutti gli offset slittino in
 * silenzio: gli indici sbagliati qui non danno errore, danno saldi sbagliati.
 */
const META = {
  outcomeSlotCount: 0,
  payoutDenominator: 1,
  /** `SIDES` collectionId, uno per index set. */
  collectionId: 2,
  /** `SIDES` numeratori, uno per slot di esito. */
  payoutNumerator: 2 + SIDES,
  stride: 2 + SIDES * 2,
} as const

/**
 * Da una lista di conditionId ai saldi ERC1155 effettivi, in tre round.
 *
 * Il positionId non si calcola off-chain: il collectionId è una somma di punti
 * su curva ellittica, non un keccak dei parametri. Quindi si passa dal
 * contratto -- `getCollectionId` per lato, poi `getPositionId` con il
 * collaterale, e solo alla fine `balanceOfBatch`. È il motivo per cui questa
 * pagina non ha bisogno di una lista di token ID cablata: basta il conditionId
 * e i due token vengono fuori da soli, per qualsiasi mercato.
 *
 * Ogni round è raggruppato da Multicall3, quindi resta una sola richiesta RPC
 * anche con dieci mercati in lista.
 */
export function useCtfPositions(conditionIds: Hex[], owner: Address | undefined) {
  // Round 1 -- stato della condizione, collectionId e payout di ciascun lato.
  const meta = useReadContracts({
    chainId: POLYGON_CHAIN_ID,
    contracts: conditionIds.flatMap((conditionId) => [
      { address: CTF_ADDRESS, abi: ctfAbi, functionName: 'getOutcomeSlotCount', args: [conditionId] },
      { address: CTF_ADDRESS, abi: ctfAbi, functionName: 'payoutDenominator', args: [conditionId] },
      ...BINARY_PARTITION.map((indexSet) => ({
        address: CTF_ADDRESS,
        abi: ctfAbi,
        functionName: 'getCollectionId' as const,
        args: [ROOT_COLLECTION_ID, conditionId, indexSet] as const,
      })),
      // Su condizione non risolta il mapping è vuoto e la lettura fallisce:
      // `allowFailure` la trasforma in una riga di errore, non in un throw.
      ...BINARY_PARTITION.map((_, slot) => ({
        address: CTF_ADDRESS,
        abi: ctfAbi,
        functionName: 'payoutNumerators' as const,
        args: [conditionId, BigInt(slot)] as const,
      })),
    ]),
    query: { enabled: conditionIds.length > 0 },
  })

  const metaRows = useMemo(() => (meta.data ?? []) as unknown as ReadRow[], [meta.data])

  /** Un'entrata per (condizione × lato), nell'ordine in cui verrà letta. */
  const sides = useMemo(
    () =>
      conditionIds.flatMap((conditionId, i) =>
        BINARY_PARTITION.map((indexSet, j) => ({
          key: `${conditionId}:${indexSet}`,
          conditionId,
          indexSet,
          collectionId: hexOf(metaRows[i * META.stride + META.collectionId + j]),
        })),
      ),
    [conditionIds, metaRows],
  )

  /** Solo i lati per cui il collectionId è già arrivato. */
  const resolvedSides = useMemo(() => sides.filter((s) => s.collectionId !== undefined), [sides])

  // Round 2 -- collectionId -> positionId (il token ID ERC1155). È legato al
  // collaterale: la stessa condizione su un altro collaterale è un altro token.
  const positionIds = useReadContracts({
    chainId: POLYGON_CHAIN_ID,
    contracts: resolvedSides.map((s) => ({
      address: CTF_ADDRESS,
      abi: ctfAbi,
      functionName: 'getPositionId' as const,
      args: [USDC_ADDRESS, s.collectionId as Hex] as const,
    })),
    query: { enabled: resolvedSides.length > 0 },
  })

  const idRows = useMemo(() => (positionIds.data ?? []) as unknown as ReadRow[], [positionIds.data])

  const idByKey = useMemo(() => {
    const map = new Map<string, bigint>()
    resolvedSides.forEach((s, i) => {
      const id = bigIntOf(idRows[i])
      if (id !== undefined) map.set(s.key, id)
    })
    return map
  }, [resolvedSides, idRows])

  // Round 3 -- i saldi, in una sola `balanceOfBatch`. L'ordine segue `sides`.
  const batch = useMemo(
    () => sides.map((s) => idByKey.get(s.key)).filter((v): v is bigint => v !== undefined),
    [sides, idByKey],
  )

  const balances = useReadContract({
    chainId: POLYGON_CHAIN_ID,
    address: CTF_ADDRESS,
    abi: ctfAbi,
    functionName: 'balanceOfBatch',
    args: owner ? [batch.map(() => owner), batch] : undefined,
    query: { enabled: Boolean(owner) && batch.length > 0 },
  })

  const conditions = useMemo<CtfCondition[]>(() => {
    // I saldi tornano nello stesso ordine di `batch`, che salta i lati senza
    // positionId: si riallinea scorrendo `sides` con lo stesso filtro.
    const balanceByKey = new Map<string, bigint>()
    const values = balances.data
    if (values) {
      let cursor = 0
      for (const s of sides) {
        if (!idByKey.has(s.key)) continue
        const value = values[cursor++]
        if (typeof value === 'bigint') balanceByKey.set(s.key, value)
      }
    }

    return conditionIds.map((conditionId, i) => {
      const base = i * META.stride
      const outcomeSlotCount = bigIntOf(metaRows[base + META.outcomeSlotCount])
      const payoutDenominator = bigIntOf(metaRows[base + META.payoutDenominator])
      const resolved = (payoutDenominator ?? 0n) > 0n

      const positions: CtfPosition[] = BINARY_PARTITION.map((indexSet, j) => {
        const key = `${conditionId}:${indexSet}`
        return {
          conditionId,
          indexSet,
          label: OUTCOME_LABELS[j] ?? `index set ${indexSet}`,
          collectionId: hexOf(metaRows[base + META.collectionId + j]),
          positionId: idByKey.get(key),
          balance: balanceByKey.get(key),
          payoutNumerator: bigIntOf(metaRows[base + META.payoutNumerator + j]),
        }
      })

      return {
        conditionId,
        outcomeSlotCount,
        payoutDenominator,
        registered: (outcomeSlotCount ?? 0n) > 0n,
        resolved,
        winningIndexSets: resolved
          ? positions.filter((p) => (p.payoutNumerator ?? 0n) > 0n).map((p) => p.indexSet)
          : [],
        positions,
      }
    })
  }, [conditionIds, metaRows, idByKey, sides, balances.data])

  const refetch = () => {
    void meta.refetch()
    void positionIds.refetch()
    void balances.refetch()
  }

  return {
    conditions,
    isLoading: meta.isLoading || positionIds.isLoading || balances.isLoading,
    isFetching: meta.isFetching || positionIds.isFetching || balances.isFetching,
    error: meta.error ?? positionIds.error ?? balances.error ?? null,
    refetch,
  }
}
