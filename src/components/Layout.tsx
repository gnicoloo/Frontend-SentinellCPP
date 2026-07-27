import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthProvider'
import CommandPalette from './CommandPalette'
import SyncStatus from './SyncStatus'

const NAV = [
  { to: '/', label: 'Dashboard', code: 'DB', end: true },
  { to: '/alerts', label: 'Alerts', code: 'AL' },
  { to: '/wallets', label: 'Wallets', code: 'WL' },
  { to: '/clusters', label: 'Clusters', code: 'CG' },
  { to: '/twap', label: 'Execution', code: 'TW' },
]

export default function Layout() {
  const { session, signOut } = useAuth()

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-sentinel-bg font-sans md:flex-row">
      <aside className="z-20 hidden w-56 shrink-0 flex-col border-r border-sentinel-border bg-sentinel-panel md:flex">
        <div className="border-b border-sentinel-border p-3">
          <h1 className="font-heading text-lg font-bold text-sentinel-accent">SENTINEL_SYS</h1>
          <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Insider Monitor v2.1</p>
        </div>

        <div className="border-b border-sentinel-border p-2">
          <CommandPalette />
        </div>

        <nav className="flex-1 space-y-0.5 p-2">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-baseline gap-2 border-l-2 px-3 py-2 font-mono text-xs uppercase tracking-widest transition-colors ${
                  isActive
                    ? 'border-sentinel-accent bg-sentinel-accent/10 text-sentinel-accent'
                    : 'border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`
              }
            >
              <span className="w-5 shrink-0 text-[10px] text-slate-600">{item.code}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-sentinel-border p-3 font-mono text-xs text-slate-500">
          <SyncStatus />
          <p className="mt-1 truncate text-[10px]">{session?.user.email}</p>
          <button
            onClick={() => void signOut()}
            className="mt-2 text-[10px] uppercase text-sentinel-destructive hover:text-red-400"
          >
            [ Logout ]
          </button>
        </div>
      </aside>

      <main className="relative flex-1 overflow-auto">
        <div className="min-w-0 p-2 pb-16 md:p-4">
          <Outlet />
        </div>
      </main>

      <nav className="fixed bottom-0 z-50 flex w-full border-t border-sentinel-border bg-sentinel-panel md:hidden">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex-1 border-t-2 py-3 text-center font-mono text-[10px] uppercase tracking-widest transition-colors ${
                isActive
                  ? 'border-sentinel-accent bg-sentinel-accent/10 text-sentinel-accent'
                  : 'border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
