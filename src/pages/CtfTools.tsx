import { useMemo, useState, type ReactNode } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import type { Hex } from 'viem'
import { ctfAbi } from '../abis/ctf'
import { erc20Abi } from '../abis/erc20'
import {
  BINARY_PARTITION,
  CTF_ADDRESS,
  KNOWN_MARKETS,
  POLYGON_CHAIN_ID,
  ROOT_COLLECTION_ID,
  USDC_ADDRESS,
  USDC_DECIMALS,
  formatAmount,
  isConditionId,
  parseAmount,
  shortHex,
  txErrorMessage,
} from '../lib/ctf'
import { INK, SERIES, STATUS } from '../lib/theme'
import { useCtfPositions, type CtfCondition } from '../hooks/useCtfPositions'
import { useTxRunner } from '../hooks/useTxRunner'
import WalletConnect from '../components/WalletConnect'
import LoadError from '../components/LoadError'
import Panel from '../components/viz/Panel'
import StatTile from '../components/viz/StatTile'

const INPUT_CLASS =
  'w-full border border-sentinel-border bg-sentinel-bg px-2 py-1.5 font-mono text-[11px] text-slate-200 placeholder:text-slate-600 focus:border-sentinel-accent focus:outline-none disabled:opacity-40'

const BUTTON_CLASS =
  'border border-sentinel-accent px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-sentinel-accent transition-colors hover:bg-sentinel-accent/10 disabled:cursor-not-allowed disabled:border-sentinel-border disabled:text-slate-600 disabled:hover:bg-transparent'

/**
 * Interazione diretta con i contratti Polygon: nessuna chiamata al CLOB
 * off-chain di Polymarket, solo `splitPosition` / `mergePositions` /
 * `redeemPositions` sul CTF e l'ERC20 del collaterale. Le firme restano tutte
 * su MetaMask -- qui non esiste nessuna chiave, e gli indirizzi dei contratti
 * sono costanti compilate, non input.
 */
export default function CtfTools() {
  const { address, chainId, isConnected } = useAccount()
  const { run, isRunning } = useTxRunner()

  const [conditionInput, setConditionInput] = useState('')
  const [splitInput, setSplitInput] = useState('')
  const [mergeInput, setMergeInput] = useState('')
  const [redeemSets, setRedeemSets] = useState<bigint[]>([...BINARY_PARTITION])

  const onPolygon = chainId === POLYGON_CHAIN_ID
  const selectedId = isConditionId(conditionInput) ? conditionInput : null

  // Si osservano i mercati della lista più, se valido, quello digitato: così la
  // tabella dei saldi non si svuota mentre si incolla un conditionId nuovo.
  const watched = useMemo<Hex[]>(() => {
    const ids = KNOWN_MARKETS.map((m) => m.conditionId)
    if (selectedId && !ids.includes(selectedId)) ids.push(selectedId)
    return ids
  }, [selectedId])

  const positions = useCtfPositions(watched, address)
  const selected = positions.conditions.find((c) => c.conditionId === selectedId) ?? null

  const usdc = useReadContract({
    chainId: POLYGON_CHAIN_ID,
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  })

  const allowance = useReadContract({
    chainId: POLYGON_CHAIN_ID,
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, CTF_ADDRESS] : undefined,
    query: { enabled: Boolean(address) },
  })

  const operatorApproved = useReadContract({
    chainId: POLYGON_CHAIN_ID,
    address: CTF_ADDRESS,
    abi: ctfAbi,
    functionName: 'isApprovedForAll',
    args: address ? [address, CTF_ADDRESS] : undefined,
    query: { enabled: Boolean(address) },
  })

  const splitAmount = parseAmount(splitInput)
  const mergeAmount = parseAmount(mergeInput)

  /** Precondizione comune a tutte le scritture. */
  const canWrite = Boolean(address) && onPolygon && !isRunning

  const refreshAll = () => {
    positions.refetch()
    void usdc.refetch()
    void allowance.refetch()
    void operatorApproved.refetch()
  }

  async function handleSplit() {
    if (!selectedId || splitAmount === null) return

    // L'allowance si controlla *prima* di firmare la split: senza, il revert
    // arriva dopo che l'utente ha già pagato il gas della transazione fallita.
    const current = allowance.data ?? 0n
    if (current < splitAmount) {
      const approved = await run('Approvazione USDC', {
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'approve',
        args: [CTF_ADDRESS, splitAmount],
      })
      if (!approved) return
      await allowance.refetch()
    }

    const ok = await run('Split', {
      address: CTF_ADDRESS,
      abi: ctfAbi,
      functionName: 'splitPosition',
      args: [USDC_ADDRESS, ROOT_COLLECTION_ID, selectedId, [...BINARY_PARTITION], splitAmount],
    })
    if (ok) refreshAll()
  }

  async function handleMerge() {
    if (!selectedId || mergeAmount === null) return
    const ok = await run('Merge', {
      address: CTF_ADDRESS,
      abi: ctfAbi,
      functionName: 'mergePositions',
      args: [USDC_ADDRESS, ROOT_COLLECTION_ID, selectedId, [...BINARY_PARTITION], mergeAmount],
    })
    if (ok) refreshAll()
  }

  async function handleRedeem() {
    if (!selectedId || redeemSets.length === 0) return
    const ok = await run('Redeem', {
      address: CTF_ADDRESS,
      abi: ctfAbi,
      functionName: 'redeemPositions',
      args: [USDC_ADDRESS, ROOT_COLLECTION_ID, selectedId, redeemSets],
    })
    if (ok) refreshAll()
  }

  async function handleApproveOperator(approved: boolean) {
    const ok = await run(approved ? 'Approvazione ERC1155' : 'Revoca ERC1155', {
      address: CTF_ADDRESS,
      abi: ctfAbi,
      functionName: 'setApprovalForAll',
      args: [CTF_ADDRESS, approved],
    })
    if (ok) void operatorApproved.refetch()
  }

  const heldPositions = positions.conditions
    .flatMap((c) => c.positions)
    .filter((p) => (p.balance ?? 0n) > 0n)

  return (
    <div className="space-y-3">
      <header className="border border-sentinel-border bg-sentinel-panel">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-sentinel-border px-3 py-2">
          <h2 className="font-heading text-base font-bold text-slate-100">Strumenti CTF</h2>
          <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
            Conditional Token Framework · on-chain diretto
          </p>
          <button
            type="button"
            onClick={refreshAll}
            disabled={!address}
            className="ml-auto border border-sentinel-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-400 transition-colors hover:text-slate-100 disabled:opacity-40"
          >
            {positions.isFetching ? 'Aggiorno…' : 'Aggiorna'}
          </button>
        </div>
        <div className="px-3 py-2">
          <WalletConnect />
        </div>
      </header>

      {!isConnected && (
        <p className="border border-sentinel-border bg-sentinel-panel px-3 py-6 text-center font-mono text-[11px] text-slate-400">
          Connetti il wallet per visualizzare le tue posizioni.
        </p>
      )}

      {isConnected && !onPolygon && (
        <p
          role="alert"
          className="border-l-2 bg-sentinel-panel px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-300"
          style={{ borderColor: STATUS.critical }}
        >
          <span style={{ color: STATUS.critical }}>⚠ Rete non supportata.</span> Le operazioni sono
          disabilitate finché il wallet non è su Polygon Mainnet (chainId {POLYGON_CHAIN_ID}). I
          saldi qui sotto restano quelli letti su Polygon.
        </p>
      )}

      {isConnected && positions.error && (
        <LoadError message={txErrorMessage(positions.error)} onRetry={refreshAll} />
      )}

      {isConnected && (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <StatTile
              label="Saldo USDC.e"
              value={formatAmount(usdc.data)}
              accent={SERIES[0]}
              footnote={`${shortHex(USDC_ADDRESS)} · ${USDC_DECIMALS} decimali`}
            />
            <StatTile
              label="Allowance verso CTF"
              value={formatAmount(allowance.data)}
              accent={SERIES[1]}
              footnote="USDC spendibile da splitPosition"
            />
            <StatTile
              label="Posizioni con saldo"
              value={String(heldPositions.length)}
              accent={SERIES[2]}
              footnote={`su ${watched.length * BINARY_PARTITION.length} lati osservati`}
            />
          </div>

          <Panel
            title="Posizioni conditional token"
            meta={`ERC1155 ${shortHex(CTF_ADDRESS)}`}
            loading={positions.isFetching}
          >
            <PositionsTable conditions={positions.conditions} loading={positions.isLoading} />
          </Panel>

          <Panel title="Mercato" meta="conditionId a 32 byte">
            <div className="space-y-2 p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-slate-500">
                    Da elenco
                  </span>
                  <select
                    className={INPUT_CLASS}
                    value={KNOWN_MARKETS.some((m) => m.conditionId === conditionInput) ? conditionInput : ''}
                    onChange={(e) => setConditionInput(e.target.value)}
                  >
                    <option value="">— seleziona —</option>
                    {KNOWN_MARKETS.map((m) => (
                      <option key={m.conditionId} value={m.conditionId}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-slate-500">
                    conditionId
                  </span>
                  <input
                    className={INPUT_CLASS}
                    placeholder="0x…"
                    spellCheck={false}
                    value={conditionInput}
                    onChange={(e) => setConditionInput(e.target.value.trim())}
                  />
                </label>
              </div>
              <ConditionStatus input={conditionInput} condition={selected} />
            </div>
          </Panel>

          <div className="grid gap-2 lg:grid-cols-3">
            <Panel title="Split" meta="USDC → SÌ + NO">
              <OperationForm
                hint="Blocca collaterale e conia un token per lato, 1:1. Se l’allowance non basta, parte prima un approve."
                amountLabel="Importo USDC"
                amountValue={splitInput}
                onAmountChange={setSplitInput}
                parsed={splitAmount}
                disabled={!canWrite || !selected?.registered}
                onSubmit={handleSplit}
                extra={
                  splitAmount !== null && (allowance.data ?? 0n) < splitAmount ? (
                    <Note tone={STATUS.warning}>
                      Allowance insufficiente ({formatAmount(allowance.data ?? 0n)} USDC): verranno
                      chieste due firme.
                    </Note>
                  ) : null
                }
              />
            </Panel>

            <Panel title="Merge" meta="SÌ + NO → USDC">
              <OperationForm
                hint="Brucia la stessa quantità di entrambi i lati e restituisce il collaterale. Serve saldo su tutti e due."
                amountLabel="Importo per lato"
                amountValue={mergeInput}
                onAmountChange={setMergeInput}
                parsed={mergeAmount}
                disabled={!canWrite || !selected?.registered}
                onSubmit={handleMerge}
                extra={
                  <Note tone="#64748b">
                    Nessun approve ERC1155: il CTF brucia i token di chi firma, non li trasferisce.
                  </Note>
                }
              />
            </Panel>

            <Panel title="Redeem" meta="esito → USDC">
              <div className="space-y-2 p-3">
                <p className="font-mono text-[10px] leading-relaxed text-slate-500">
                  Riscuote i token del lato vincente. Il mercato deve essere risolto dall’oracolo.
                </p>
                <fieldset className="space-y-1">
                  <legend className="mb-1 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                    Index set
                  </legend>
                  {BINARY_PARTITION.map((set, i) => {
                    const checked = redeemSets.includes(set)
                    const wins = selected?.winningIndexSets.includes(set)
                    return (
                      <label key={String(set)} className="flex items-center gap-2 font-mono text-[11px] text-slate-300">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setRedeemSets((prev) =>
                              e.target.checked
                                ? [...prev, set].sort((a, b) => (a < b ? -1 : 1))
                                : prev.filter((s) => s !== set),
                            )
                          }
                          className="accent-[#22C55E]"
                        />
                        <span>{i === 0 ? 'SÌ' : 'NO'} · index set {String(set)}</span>
                        {selected?.resolved && (
                          <span
                            className="font-mono text-[9px] uppercase tracking-wider"
                            style={{ color: wins ? STATUS.good : INK.muted }}
                          >
                            {wins ? '✓ paga' : '✕ non paga'}
                          </span>
                        )}
                      </label>
                    )
                  })}
                </fieldset>
                {selected && !selected.resolved && (
                  <Note tone={STATUS.warning}>
                    Condizione non ancora risolta (payoutDenominator = 0): il redeem verrebbe
                    respinto dal contratto.
                  </Note>
                )}
                <button
                  type="button"
                  className={BUTTON_CLASS}
                  disabled={!canWrite || !selected?.registered || redeemSets.length === 0}
                  onClick={() => void handleRedeem()}
                >
                  Esegui redeem
                </button>
              </div>
            </Panel>
          </div>

          <Panel title="Approvazioni" meta="stato degli spender">
            <div className="space-y-2 p-3 font-mono text-[11px]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-500">USDC → CTF:</span>
                <span className="text-slate-200">{formatAmount(allowance.data)} USDC</span>
                <span className="text-slate-600">
                  — gestita automaticamente dallo split, per l’importo esatto.
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-500">ERC1155 → CTF:</span>
                <span className="text-slate-200">
                  {operatorApproved.data === undefined ? '—' : operatorApproved.data ? 'attiva' : 'assente'}
                </span>
                <button
                  type="button"
                  className="border border-sentinel-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-400 transition-colors hover:text-slate-100 disabled:opacity-40"
                  disabled={!canWrite}
                  onClick={() => void handleApproveOperator(!operatorApproved.data)}
                >
                  {operatorApproved.data ? 'Revoca' : 'Approva'}
                </button>
              </div>
              <p className="leading-relaxed text-slate-600">
                L’approvazione ERC1155 non serve a merge e redeem: quelle operazioni bruciano i token
                di chi firma la transazione. Resta qui perché è il permesso che un operatore terzo
                (per esempio l’exchange) richiederebbe per muovere le posizioni.
              </p>
            </div>
          </Panel>
        </>
      )}
    </div>
  )
}

function Note({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <p className="border-l-2 pl-2 font-mono text-[10px] leading-relaxed text-slate-400" style={{ borderColor: tone }}>
      {children}
    </p>
  )
}

interface OperationFormProps {
  hint: string
  amountLabel: string
  amountValue: string
  onAmountChange: (value: string) => void
  parsed: bigint | null
  disabled: boolean
  onSubmit: () => Promise<void>
  extra?: ReactNode
}

function OperationForm({
  hint, amountLabel, amountValue, onAmountChange, parsed, disabled, onSubmit, extra,
}: OperationFormProps) {
  const invalid = amountValue.trim() !== '' && parsed === null

  return (
    <form
      className="space-y-2 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        void onSubmit()
      }}
    >
      <p className="font-mono text-[10px] leading-relaxed text-slate-500">{hint}</p>
      <label className="block">
        <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-slate-500">
          {amountLabel}
        </span>
        <input
          className={INPUT_CLASS}
          inputMode="decimal"
          placeholder="0.00"
          value={amountValue}
          onChange={(e) => onAmountChange(e.target.value)}
        />
      </label>
      {invalid && (
        <Note tone={STATUS.critical}>
          Importo non valido: massimo {USDC_DECIMALS} decimali, maggiore di zero.
        </Note>
      )}
      {extra}
      <button type="submit" className={BUTTON_CLASS} disabled={disabled || parsed === null}>
        Esegui
      </button>
    </form>
  )
}

function ConditionStatus({ input, condition }: { input: string; condition: CtfCondition | null }) {
  if (input.trim() === '') {
    return (
      <p className="font-mono text-[10px] text-slate-600">
        Seleziona o incolla un conditionId per abilitare le operazioni.
      </p>
    )
  }
  if (!isConditionId(input)) {
    return <Note tone={STATUS.critical}>Formato non valido: serve un esadecimale di 32 byte (0x + 64 caratteri).</Note>
  }
  if (!condition || condition.outcomeSlotCount === undefined) {
    return <p className="font-mono text-[10px] text-slate-600">Lettura dello stato della condizione…</p>
  }
  if (!condition.registered) {
    return (
      <Note tone={STATUS.critical}>
        Condizione non registrata su questo CTF (outcomeSlotCount = 0). L’ID è sbagliato oppure il
        mercato vive su un altro contratto.
      </Note>
    )
  }
  return (
    <p className="font-mono text-[10px] text-slate-400">
      <span style={{ color: condition.resolved ? STATUS.good : STATUS.warning }}>
        {condition.resolved ? '✓ risolta' : '◴ aperta'}
      </span>
      <span className="ml-2 text-slate-600">
        {String(condition.outcomeSlotCount)} esiti · payoutDenominator{' '}
        {String(condition.payoutDenominator ?? 0n)}
      </span>
    </p>
  )
}

function PositionsTable({ conditions, loading }: { conditions: CtfCondition[]; loading: boolean }) {
  const rows = conditions.flatMap((c) =>
    c.positions.map((p) => ({
      ...p,
      market: KNOWN_MARKETS.find((m) => m.conditionId === c.conditionId)?.label ?? shortHex(c.conditionId, 10, 6),
      registered: c.registered,
    })),
  )

  return (
    <div className="max-h-80 overflow-auto">
      <table className="w-full text-[10px] font-mono">
        <thead className="sticky top-0 bg-sentinel-panel text-left uppercase tracking-wider text-slate-500">
          <tr className="border-b border-sentinel-border">
            <th className="px-3 py-1.5 font-normal">Mercato</th>
            <th className="px-3 py-1.5 font-normal">Lato</th>
            <th className="px-3 py-1.5 font-normal">Token ID (ERC1155)</th>
            <th className="px-3 py-1.5 text-right font-normal">Saldo</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="px-3 py-4 text-center text-slate-600">
                {loading ? 'LETTURA IN CORSO…' : 'NESSUNA POSIZIONE'}
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={`${r.conditionId}:${r.indexSet}`} className="border-b border-sentinel-border/40">
              <td className="px-3 py-1 text-slate-300" title={r.conditionId}>
                {r.market}
                {!r.registered && <span className="ml-2 text-slate-600">(non registrata)</span>}
              </td>
              <td className="px-3 py-1 text-slate-400">{r.label}</td>
              <td className="px-3 py-1 text-slate-500" title={r.positionId ? String(r.positionId) : undefined}>
                {r.positionId ? shortHex(r.positionId.toString(), 8, 6) : '—'}
              </td>
              <td className="num px-3 py-1 text-right text-slate-300">
                {r.balance === undefined ? '—' : formatAmount(r.balance)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
