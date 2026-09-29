'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ProgramIcon } from './ProgramIcon'
import {
  ASSESSMENT_PRICE_RM,
  PREMIUM_CLASS_PRICE_RM,
  PROGRAM_COMPLETION_PRICE_RM,
  PROGRAM_SAVINGS_RM,
  PROGRAM_TIME_ZONE_LABEL,
  PROGRAM_TOTAL_PRICE_RM,
  PROGRAM_TOTAL_SAVINGS_RM,
  PROGRAM_TOTAL_SESSIONS,
  REMAINING_AFTER_ASSESSMENT,
  rm,
} from '@/lib/programs/catalog'
import { formatLongDateTime, formatRemaining } from '@/lib/programs/format'

interface OfferCardProps {
  expiresAt: string
  /** "Ahora" del servidor: primer render idéntico en servidor y navegador */
  serverNow: string
}

/**
 * Propuesta de completar el plan. La caducidad se enseña siempre como fecha y
 * hora exactas (con la zona), y además como cuenta atrás, que es lo que se
 * entiende de un vistazo.
 */
export function OfferCard({ expiresAt, serverNow }: OfferCardProps) {
  const expires = new Date(expiresAt)
  const [now, setNow] = useState(() => new Date(serverNow))
  const [accepted, setAccepted] = useState(false)

  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  const expired = now >= expires

  if (expired) {
    return (
      <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Oferta caducada</p>
        <h2 className="mt-1 text-lg font-semibold text-gray-900">La propuesta del plan ya no está disponible</h2>
        <p className="mt-2 text-sm text-gray-600">
          Caducó el <span className="font-medium text-gray-900">{formatLongDateTime(expires)}</span> (
          {PROGRAM_TIME_ZONE_LABEL}). Tu evaluación sigue siendo tuya y puedes seguir entrenando con clases
          premium sueltas a {rm(PREMIUM_CLASS_PRICE_RM)}, pista incluida.
        </p>
        <button
          type="button"
          disabled
          className="mt-5 h-12 w-full rounded-xl bg-gray-100 text-gray-400 font-semibold cursor-not-allowed"
        >
          Reservar clase premium (no conectado)
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl ring-2 ring-blue-600 p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Tu propuesta</p>
      <h2 className="mt-1 text-lg font-semibold text-gray-900">
        Completa tu plan: {REMAINING_AFTER_ASSESSMENT} sesiones más
      </h2>

      <div className="mt-4 rounded-xl bg-blue-50 px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-blue-700">
          <ProgramIcon name="clock" size={16} />
          Quedan <span className="tabular-nums">{formatRemaining(expires, now)}</span>
        </p>
        <p className="mt-1 text-sm text-gray-700">
          Caduca el <time dateTime={expiresAt} className="font-semibold text-gray-900">{formatLongDateTime(expires)}</time>
        </p>
        <p className="text-xs text-gray-500">{PROGRAM_TIME_ZONE_LABEL}</p>
      </div>

      <dl className="mt-5 flex flex-col gap-2.5 text-sm">
        <div className="flex justify-between gap-4 text-gray-600">
          <dt>Evaluación (sesión 1)</dt>
          <dd className="tabular-nums">
            {rm(ASSESSMENT_PRICE_RM)} <span className="text-emerald-600 font-medium">· pagada</span>
          </dd>
        </div>
        <div className="flex justify-between gap-4 text-gray-600">
          <dt>Sesiones 2 a {PROGRAM_TOTAL_SESSIONS}, pista incluida</dt>
          <dd className="tabular-nums">{rm(PROGRAM_COMPLETION_PRICE_RM)}</dd>
        </div>
        <div className="flex justify-between gap-4 pt-2.5 border-t border-gray-100 text-gray-500 text-xs">
          <dt>Plan completo de {PROGRAM_TOTAL_SESSIONS} sesiones</dt>
          <dd className="tabular-nums">{rm(PROGRAM_TOTAL_PRICE_RM)}</dd>
        </div>
        <div className="flex justify-between items-baseline gap-4">
          <dt className="font-medium text-gray-900">A pagar ahora</dt>
          <dd className="text-2xl font-bold text-gray-900 tabular-nums">{rm(PROGRAM_COMPLETION_PRICE_RM)}</dd>
        </div>
      </dl>
      <ul className="mt-2 flex flex-col gap-0.5 text-xs text-emerald-600 font-medium">
        <li>
          Ahorras {rm(PROGRAM_SAVINGS_RM)} frente a comprar por separado las {REMAINING_AFTER_ASSESSMENT} sesiones
          restantes.
        </li>
        <li>
          En total, {rm(PROGRAM_TOTAL_SAVINGS_RM)} menos que {PROGRAM_TOTAL_SESSIONS} clases premium sueltas.
        </li>
      </ul>

      {accepted ? (
        <div className="mt-6 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700" role="status">
          <p className="font-semibold text-gray-900">Aquí iría el pago.</p>
          <p className="mt-1">
            El cobro no está conectado en el prototipo. Así se vería tu plan una vez aceptado:
          </p>
          <Link href="/programa/mi-programa" className="mt-2 inline-flex items-center gap-1.5 font-semibold text-blue-600 hover:text-blue-700">
            Ver Mi programa <ProgramIcon name="arrow-right" size={16} />
          </Link>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAccepted(true)}
          className="mt-6 h-12 w-full rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 active:scale-[0.98] shadow-sm shadow-blue-600/25 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          Completar mi plan · {rm(PROGRAM_COMPLETION_PRICE_RM)}
        </button>
      )}
      <p className="mt-3 text-xs text-gray-500 text-center">
        Si no lo completas, no pagas nada más. Tu evaluación ya está pagada.
      </p>
    </div>
  )
}
