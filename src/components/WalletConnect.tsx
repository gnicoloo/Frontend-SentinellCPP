import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi'
import { POLYGON_CHAIN_ID, shortHex, txErrorMessage } from '../lib/ctf'
import { STATUS } from '../lib/theme'

/**
 * Connessione al wallet e stato della rete, in una riga sola.
 *
 * La rete sbagliata è l'errore più costoso di questa pagina: una `splitPosition`
 * mandata su un'altra chain non fallisce a monte, viene semplicemente inviata a
 * un indirizzo che lì non è il CTF. Per questo lo stato di rete è sempre a
 * schermo e non solo nel momento in cui si firma.
 */
export default function WalletConnect() {
  const { address, chainId, isConnected, isConnecting, isReconnecting } = useAccount()
  const { connect, connectors, isPending: connectPending, error: connectError } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: switchPending } = useSwitchChain()

  const injected = connectors[0]
  const wrongNetwork = isConnected && chainId !== POLYGON_CHAIN_ID
  const busy = connectPending || isConnecting || isReconnecting

  if (!isConnected) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || !injected}
          onClick={() => injected && connect({ connector: injected })}
          className="border border-sentinel-accent px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-sentinel-accent transition-colors hover:bg-sentinel-accent/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? 'Connessione…' : 'Connetti Wallet'}
        </button>
        {connectError && (
          <span className="font-mono text-[10px]" style={{ color: STATUS.critical }}>
            {txErrorMessage(connectError)}
          </span>
        )}
        {!injected && (
          <span className="font-mono text-[10px] text-slate-500">
            Nessun wallet rilevato — installa MetaMask.
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span
        className="border-l-2 pl-2 font-mono text-[11px] text-slate-200"
        style={{ borderColor: wrongNetwork ? STATUS.critical : STATUS.good }}
        title={address}
      >
        {address ? shortHex(address, 6, 4) : '—'}
      </span>

      {wrongNetwork ? (
        <>
          <span className="font-mono text-[10px] uppercase tracking-wider" style={{ color: STATUS.critical }}>
            ⚠ Rete errata (chainId {chainId})
          </span>
          <button
            type="button"
            disabled={switchPending}
            onClick={() => switchChain({ chainId: POLYGON_CHAIN_ID })}
            className="border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors disabled:opacity-40"
            style={{ borderColor: STATUS.critical, color: STATUS.critical }}
          >
            {switchPending ? 'Passaggio…' : 'Passa a Polygon'}
          </button>
        </>
      ) : (
        <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
          Polygon Mainnet · 137
        </span>
      )}

      <button
        type="button"
        onClick={() => disconnect()}
        className="ml-auto font-mono text-[10px] uppercase tracking-wider text-slate-500 transition-colors hover:text-sentinel-destructive"
      >
        [ Disconnetti ]
      </button>
    </div>
  )
}
