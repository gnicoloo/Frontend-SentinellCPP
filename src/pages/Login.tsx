import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthProvider'

export default function Login() {
  const { session, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to="/" replace />

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const err = await signIn(email, password)
    if (err) setError(err)
    setBusy(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-sentinel-bg">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm border border-sentinel-border bg-sentinel-panel p-6 shadow-2xl"
      >
        <h1 className="mb-1 text-xl font-bold text-sentinel-accent font-heading">SENTINEL_SYS</h1>
        <p className="mb-6 text-xs text-slate-500 font-mono tracking-widest uppercase">Authorized Personnel Only</p>
        
        <label className="mb-3 block text-[10px] font-mono text-slate-400 uppercase tracking-wider">
          Email Address
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full border border-sentinel-border bg-sentinel-bg px-3 py-2 text-sm font-mono text-slate-200 outline-none focus:border-sentinel-accent focus:ring-1 focus:ring-sentinel-accent transition-colors"
          />
        </label>
        
        <label className="mb-6 block text-[10px] font-mono text-slate-400 uppercase tracking-wider">
          Password
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full border border-sentinel-border bg-sentinel-bg px-3 py-2 text-sm font-mono text-slate-200 outline-none focus:border-sentinel-accent focus:ring-1 focus:ring-sentinel-accent transition-colors"
          />
        </label>
        
        {error && <p className="mb-4 text-xs font-mono text-sentinel-destructive">ERR: {error}</p>}
        
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-sentinel-accent px-3 py-2 text-xs font-bold font-mono tracking-widest text-sentinel-bg hover:bg-green-400 disabled:opacity-50 transition-colors uppercase"
        >
          {busy ? 'Authenticating...' : 'Login'}
        </button>
      </form>
    </div>
  )
}
