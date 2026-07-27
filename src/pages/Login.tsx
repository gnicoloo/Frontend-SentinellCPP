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
    <div className="flex min-h-screen items-center justify-center">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-lg border border-sentinel-border bg-sentinel-panel p-6"
      >
        <h1 className="mb-1 text-xl font-bold text-sentinel-accent">🛰️ Sentinel</h1>
        <p className="mb-5 text-sm text-slate-500">Accedi con il tuo account Supabase</p>
        <label className="mb-3 block text-sm">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded border border-sentinel-border bg-sentinel-bg px-3 py-2 outline-none focus:border-sentinel-accent"
          />
        </label>
        <label className="mb-4 block text-sm">
          Password
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border border-sentinel-border bg-sentinel-bg px-3 py-2 outline-none focus:border-sentinel-accent"
          />
        </label>
        {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded bg-sentinel-accent px-3 py-2 font-semibold text-sentinel-bg hover:bg-sky-300 disabled:opacity-50"
        >
          {busy ? 'Accesso…' : 'Login'}
        </button>
      </form>
    </div>
  )
}
