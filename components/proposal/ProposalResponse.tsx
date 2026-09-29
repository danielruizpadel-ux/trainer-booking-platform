'use client'

import { useState } from 'react'

interface ProposalResponseProps {
  token: string
  trainerSlug: string
}

type State = { kind: 'idle' } | { kind: 'busy'; action: 'accept' | 'decline' } | { kind: 'done'; accepted: boolean } | { kind: 'error'; message: string }

/** Aceptar / Elegir otra → POST /api/propuesta/[token]. */
export function ProposalResponse({ token, trainerSlug }: ProposalResponseProps) {
  const [state, setState] = useState<State>({ kind: 'idle' })

  async function respond(action: 'accept' | 'decline') {
    setState({ kind: 'busy', action })
    try {
      const response = await fetch(`/api/propuesta/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) throw new Error(data.error || 'No se pudo enviar tu respuesta')
      setState({ kind: 'done', accepted: data.accepted })
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'No se pudo enviar tu respuesta' })
    }
  }

  if (state.kind === 'done') {
    return (
      <div className="text-center">
        <h2 className="text-base font-semibold text-gray-900">
          {state.accepted ? 'Fecha aceptada' : 'Entendido'}
        </h2>
        <p className="mt-1.5 text-sm text-gray-600">
          {state.accepted
            ? 'Tu entrenador te confirmará la clase en cuanto reserve la pista.'
            : 'Elige la hora que prefieras desde la web y te la confirmamos.'}
        </p>
        {!state.accepted && trainerSlug && (
          <a
            href={`/${trainerSlug}#booking-section`}
            className="mt-5 inline-flex h-12 px-6 items-center justify-center rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 active:scale-[0.98] shadow-sm shadow-blue-600/25 transition-all duration-150"
          >
            Elegir otra hora
          </a>
        )}
      </div>
    )
  }

  const busy = state.kind === 'busy'

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => respond('accept')}
        disabled={busy}
        className="h-12 px-6 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 active:scale-[0.98] shadow-sm shadow-blue-600/25 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none disabled:cursor-not-allowed"
      >
        {state.kind === 'busy' && state.action === 'accept' ? 'Enviando…' : 'Aceptar esta fecha'}
      </button>
      <button
        type="button"
        onClick={() => respond('decline')}
        disabled={busy}
        className="h-12 px-6 rounded-xl bg-white text-gray-900 font-semibold ring-1 ring-inset ring-gray-200 hover:ring-gray-300 hover:bg-gray-50 active:scale-[0.98] transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
      >
        {state.kind === 'busy' && state.action === 'decline' ? 'Enviando…' : 'Prefiero elegir otra'}
      </button>
      {state.kind === 'error' && (
        <p role="alert" className="text-sm text-red-600 text-center">
          {state.message}
        </p>
      )}
    </div>
  )
}
