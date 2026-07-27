import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthProvider'

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/alerts', label: 'Alerts' },
  { to: '/wallets', label: 'Wallets' },
  { to: '/clusters', label: 'Clusters' },
]

export default function Layout() {
  const { session, signOut } = useAuth()

  return (
    <div className="flex h-screen overflow-hidden bg-sentinel-bg flex-col md:flex-row font-sans">
      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-sentinel-border bg-sentinel-panel z-20">
        <div className="border-b border-sentinel-border p-4">
          <h1 className="text-lg font-bold text-sentinel-accent font-heading">SENTINEL_SYS</h1>
          <p className="text-[10px] uppercase text-slate-500 font-mono tracking-wider">Insider Monitor v2.1</p>
        </div>
        <nav className="flex-1 space-y-1 p-2">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block rounded-sm px-3 py-2 text-xs font-mono uppercase tracking-widest transition-colors ${
                  isActive
                    ? 'bg-sentinel-accent/10 text-sentinel-accent border-l-2 border-sentinel-accent'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200 border-l-2 border-transparent'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-sentinel-border p-3 text-xs text-slate-500 font-mono">
          <p className="truncate text-[10px]">{session?.user.email}</p>
          <button onClick={() => void signOut()} className="mt-2 text-sentinel-destructive hover:text-red-400 text-[10px] uppercase">
            [ Logout ]
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-auto relative">
        <div className="p-2 md:p-4 min-w-0 pb-16 md:pb-4">
          <Outlet />
        </div>
      </main>

      {/* Bottom Nav for Mobile */}
      <nav className="md:hidden fixed bottom-0 w-full flex border-t border-sentinel-border bg-sentinel-panel z-50">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex-1 text-center py-3 text-[10px] font-mono uppercase tracking-widest border-t-2 transition-colors ${
                isActive
                  ? 'border-sentinel-accent text-sentinel-accent bg-sentinel-accent/10'
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
