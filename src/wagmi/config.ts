import { createConfig, http, injected } from 'wagmi'
import { polygon } from 'wagmi/chains'

/**
 * Una sola chain configurata: Polygon PoS. Non è una limitazione da aggirare,
 * è il controllo di rete -- se il wallet è altrove, `useAccount().chainId` non
 * combacia e la pagina blocca ogni scrittura finché non si passa a 137.
 *
 * Nessuna chiave privata, nessun signer locale: il connector `injected` parla
 * solo con l'extension (MetaMask), e ogni transazione è firmata lì dall'utente.
 */
export const wagmiConfig = createConfig({
  chains: [polygon],
  connectors: [injected()],
  transports: {
    // L'RPC pubblico di default regge le letture di questa pagina, ma è
    // aggressivo sul rate limit: in produzione conviene un endpoint proprio
    // (Alchemy/Infura) via VITE_POLYGON_RPC_URL. È un URL pubblico, non un
    // segreto -- se l'endpoint richiede una API key, usa un proxy lato server.
    [polygon.id]: http(import.meta.env.VITE_POLYGON_RPC_URL || undefined),
  },
})

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig
  }
}
