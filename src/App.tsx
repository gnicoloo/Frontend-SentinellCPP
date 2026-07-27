import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthProvider'
import { RangeProvider } from './context/RangeProvider'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import AlertExplorer from './pages/AlertExplorer'
import WalletList from './pages/WalletList'
import WalletDetail from './pages/WalletDetail'
import ClusterGraph from './pages/ClusterGraph'
import TwapScanner from './pages/TwapScanner'

export default function App() {
  return (
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
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
