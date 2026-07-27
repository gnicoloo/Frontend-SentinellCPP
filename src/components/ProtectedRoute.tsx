import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthProvider'

export default function ProtectedRoute() {
  const { session, loading } = useAuth()
  if (loading) {
    return <div className="flex h-screen items-center justify-center text-slate-400">Caricamento…</div>
  }
  if (!session) return <Navigate to="/login" replace />
  return <Outlet />
}
