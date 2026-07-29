import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import App from './App'
import { wagmiConfig } from './wagmi/config'
import './index.css'

// wagmi tiene la cache delle letture on-chain in react-query: entrambi i
// provider devono stare sopra a qualsiasi hook `useReadContract`. Il resto
// dell'app continua a leggere da Supabase con i suoi hook -- qui non cambia
// nulla, react-query serve solo alla parte on-chain.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Un saldo on-chain invecchia in fretta ma non a ogni focus: rileggerlo
      // a ogni ritorno sulla tab bruciava il rate limit dell'RPC pubblico.
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
)
