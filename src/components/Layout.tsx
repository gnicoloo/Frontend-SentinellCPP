import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthProvider'

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/alerts', label: 'Alert Explorer' },
  { to: '/wallets', label: 'Wallet' },
  { to: '/clusters', label: 'Cluster Graph' },
]

export default function Layout() {
  const { session, signOut } = useAuth()

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-sentinel-border bg-sentinel-panel">
        <div className="border-b border-sentinel-border p-4">
          <h1 className="text-lg font-bold text-sentinel-accent">🛰️ Sentinel</h1>
          <p className="text-xs text-slate-500">Polymarket insider monitor</p>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block rounded px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-sentinel-accent/15 text-sentinel-accent'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-sentinel-border p-3 text-xs text-slate-500">
          <p className="truncate">{session?.user.email}</p>
          <button onClick={() => void signOut()} className="mt-2 text-red-400 hover:text-red-300">
            Logout
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-6">
        <Outlet />
      </main>
    </div>
  )
}
