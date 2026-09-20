'use client'

import { useState, type FormEvent } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase/browser'

interface LoginFormProps {
  /** Error que viene en la URL (p.ej. enlace caducado) */
  initialError: string | null
  /** Ruta interna a la que volver tras entrar */
  next: string | null
}

type Status = 'idle' | 'sending' | 'sent' | 'redirecting'

export function LoginForm({ initialError, next }: LoginFormProps) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(initialError)

  const busy = status === 'sending' || status === 'redirecting'

  function callbackUrl() {
    const url = new URL('/dashboard/auth/callback', window.location.origin)
    if (next) url.searchParams.set('next', next)
    return url.toString()
  }

  async function sendMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setStatus('sending')

    const supabase = createBrowserSupabaseClient()
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: callbackUrl() },
    })

    if (error) {
      setError(error.message)
      setStatus('idle')
      return
    }

    setStatus('sent')
  }

  async function signInWithGoogle() {
    setError(null)
    setStatus('redirecting')

    const supabase = createBrowserSupabaseClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl() },
    })

    if (error) {
      setError(error.message)
      setStatus('idle')
    }
    // Si no hay error, el navegador ya está yendo a Google.
  }

  if (status === 'sent') {
    return (
      <div className="flex flex-col items-center text-center gap-4">
        <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 7 9 6 9-6" />
          </svg>
        </div>
        <div>
          <h2 className="text-base font-semibold text-gray-900">Revisa tu correo</h2>
          <p className="mt-1.5 text-sm text-gray-600">
            Hemos enviado un enlace a <span className="font-medium text-gray-900">{email}</span>.
            Ábrelo en este mismo navegador para entrar.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setStatus('idle')}
          className="h-9 px-3 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"
        >
          Usar otro correo
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={sendMagicLink} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium text-gray-900">
            Correo electrónico
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={busy}
            placeholder="tu@correo.com"
            className="h-12 w-full rounded-xl px-4 text-gray-900 placeholder:text-gray-400 ring-1 ring-inset ring-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-all duration-150"
          />
        </div>

        <button
          type="submit"
          disabled={busy || email.trim().length === 0}
          className="h-12 px-6 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 active:scale-[0.98] shadow-sm shadow-blue-600/25 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none disabled:cursor-not-allowed disabled:active:scale-100"
        >
          {status === 'sending' ? 'Enviando…' : 'Enviar enlace mágico'}
        </button>
      </form>

      <div className="flex items-center gap-3">
        <div className="flex-1 border-t border-gray-100" />
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">o</span>
        <div className="flex-1 border-t border-gray-100" />
      </div>

      <button
        type="button"
        onClick={signInWithGoogle}
        disabled={busy}
        className="h-12 px-6 rounded-xl bg-white text-gray-900 font-semibold ring-1 ring-inset ring-gray-200 hover:ring-gray-300 hover:bg-gray-50 active:scale-[0.98] transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center gap-3"
      >
        <GoogleMark />
        {status === 'redirecting' ? 'Redirigiendo…' : 'Continuar con Google'}
      </button>

      {error && (
        <p role="alert" className="text-sm text-red-600 text-center">
          {error}
        </p>
      )}
    </div>
  )
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.87c2.27-2.09 3.55-5.17 3.55-8.87Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.94-2.91l-3.87-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29A7.2 7.2 0 0 1 4.89 12c0-.8.14-1.57.38-2.29V6.62H1.29A12 12 0 0 0 0 12c0 1.94.46 3.77 1.29 5.38l3.98-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  )
}
