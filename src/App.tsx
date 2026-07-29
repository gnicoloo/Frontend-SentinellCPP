import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthProvider'
import { RangeProvider } from './context/RangeProvider'
import ErrorBoundary from './components/ErrorBoundary'
import { ToastProvider } from './components/Toast'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import AlertExplorer from './pages/AlertExplorer'
import WalletList from './pages/WalletList'
import WalletDetail from './pages/WalletDetail'
import ClusterGraph from './pages/ClusterGraph'
import TwapScanner from './pages/TwapScanner'
import CtfTools from './pages/CtfTools'

export default function App() {
  return (
    // Il boundary sta fuori da tutto: deve reggere anche un errore dei provider
    // o del router, non solo di una pagina.
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route element={<ProtectedRoute />}>
                <Route
                  element={
                    <RangeProvider>
                      <Layout />
                    </RangeProvider>
                  }
                >
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/alerts" element={<AlertExplorer />} />
                  <Route path="/wallets" element={<WalletList />} />
                  <Route path="/wallet/:address" element={<WalletDetail />} />
                  <Route path="/clusters" element={<ClusterGraph />} />
                  <Route path="/twap" element={<TwapScanner />} />
                  <Route path="/ctf" element={<CtfTools />} />
                </Route>
              </Route>
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  )
}
