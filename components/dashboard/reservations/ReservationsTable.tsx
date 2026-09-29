'use client'

import { useEffect, useMemo, useState } from 'react'
import type { TrainerReservation } from '@/lib/reservations/queries'
import {
  formatDuration,
  formatTime,
  normalizeForSearch,
  reservationRangeOf,
  reservationTab,
  type ReservationTab,
} from '@/lib/reservations/format'
import { StatusBadge } from './StatusBadge'
import { formatDayShortEn } from '@/lib/booking/format-en'
import { formatRM } from '@/lib/reservations/pricing'
import { playersLabel } from './ReservationClientInfo'
import { ReservationRowActions } from './ReservationRowActions'
import { ReservationMobileCard } from './ReservationMobileCard'

interface ReservationsTableProps {
  reservations: TrainerReservation[]
  /** Selector de vista (Tabla / Calendario), a la izquierda de las pestañas */
  leading?: React.ReactNode
  /** Reserva a la que saltar (desde el calendario). `nonce` cambia en cada salto. */
  focus?: { id: string; nonce: number } | null
}

const TABS: Array<{ id: ReservationTab; label: string }> = [
  { id: 'pending', label: 'Pending' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'cancelled', label: 'Cancelled' },
]

const EMPTY_TEXT: Record<ReservationTab, string> = {
  pending: 'Nothing pending. Every request has been answered.',
  confirmed: 'No confirmed classes yet.',
  cancelled: 'No cancelled bookings or bookings waiting for a new time.',
}

/**
 * Pestañas de estado + buscador + tabla (md+) o tarjetas apiladas (móvil).
 * Solo presentación: la decisión sobre una reserva sigue en ReservationActions.
 */
export function ReservationsTable({ reservations, leading, focus = null }: ReservationsTableProps) {
  const [tab, setTab] = useState<ReservationTab>('pending')
  const [query, setQuery] = useState('')
  const [highlightId, setHighlightId] = useState<string | null>(null)

  // Salto desde el calendario: pestaña correcta, sin filtro, scroll y resalte breve.
  useEffect(() => {
    if (!focus) return
    const target = reservations.find((r) => r.id === focus.id)
    if (!target) return
    setTab(reservationTab(target.status))
    setQuery('')
    setHighlightId(target.id)
    const frame = requestAnimationFrame(() => {
      const nodes = document.querySelectorAll<HTMLElement>(`[data-reservation-id="${target.id}"]`)
      const visible = Array.from(nodes).find((n) => n.offsetParent !== null)
      visible?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    const timer = setTimeout(() => setHighlightId(null), 3000)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }, [focus, reservations])

  const counts = useMemo(() => {
    const c: Record<ReservationTab, number> = { pending: 0, confirmed: 0, cancelled: 0 }
    for (const r of reservations) c[reservationTab(r.status)] += 1
    return c
  }, [reservations])

  const rows = useMemo(() => {
    const needle = normalizeForSearch(query)
    return reservations.filter(
      (r) =>
        reservationTab(r.status) === tab &&
        (needle === '' || normalizeForSearch(r.client_name).includes(needle))
    )
  }, [reservations, tab, query])

  return (
    <div className="flex flex-col gap-4">
      {/* Pestañas + buscador */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          {leading}
          <div role="tablist" aria-label="Status" className="flex gap-0 sm:gap-1 border-b border-gray-100 -mb-px overflow-x-auto">
          {TABS.map(({ id, label }) => {
            const active = tab === id
            return (
              <button
                key={id}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => setTab(id)}
                className={`h-10 px-2 sm:px-3 text-[13px] sm:text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-t-lg ${
                  active
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300'
                }`}
              >
                {label}{' '}
                <span className={`tabular-nums ${active ? 'text-blue-600/70' : 'text-gray-400'}`}>
                  ({counts[id]})
                </span>
              </button>
            )
          })}
          </div>
        </div>

        <label className="relative block md:w-72">
          <span className="sr-only">Search by client name</span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search client…"
            className="h-10 w-full rounded-xl bg-white pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 ring-1 ring-inset ring-gray-200 hover:ring-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-150"
          />
        </label>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500 bg-white rounded-2xl ring-1 ring-gray-200/70 p-6">
          {query.trim() ? `Ningún cliente coincide con "${query.trim()}".` : EMPTY_TEXT[tab]}
        </p>
      ) : (
        <>
          {/* Tabla (lg+) */}
          <div className="hidden xl:block bg-white rounded-2xl ring-1 ring-gray-200/70 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50/50 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
                    <Th>Client</Th>
                    <Th>Contact</Th>
                    <Th>Date</Th>
                    <Th>Time</Th>
                    <Th>Duration</Th>
                    <Th className="text-right">Price</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      data-reservation-id={r.id}
                      className={`border-t border-gray-100 transition-colors align-top ${
                        highlightId === r.id ? 'bg-blue-50/70' : 'hover:bg-gray-50/50'
                      }`}
                    >
                      <Td>
                        <p className="font-medium text-gray-900 whitespace-nowrap">{r.client_name}</p>
                        <p className="mt-0.5 text-xs text-gray-500 whitespace-nowrap">
                          {playersLabel(r.player_count)}
                          {r.client_message && (
                            <span title="The client left a message (open Edit)" className="ml-1.5 inline-flex items-center gap-1 text-blue-600">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                              </svg>
                              Message
                            </span>
                          )}
                        </p>
                      </Td>
                      <Td>
                        <div className="flex flex-col gap-0.5 text-gray-600">
                          <a
                            href={`mailto:${r.client_email}`}
                            title={r.client_email}
                            className="hover:text-gray-900 underline-offset-2 hover:underline truncate max-w-[13rem] block"
                          >
                            {r.client_email}
                          </a>
                          {r.client_phone && (
                            <a href={`tel:${r.client_phone}`} className="hover:text-gray-900 underline-offset-2 hover:underline whitespace-nowrap">
                              {r.client_phone}
                            </a>
                          )}
                        </div>
                      </Td>
                      <Td className="whitespace-nowrap text-gray-900">
                        {r.slot ? formatDayShortEn(r.slot.session_date) : <span className="text-gray-400">—</span>}
                      </Td>
                      <Td className="whitespace-nowrap tabular-nums text-gray-900">
                        {reservationRangeOf(r) ? formatTime(reservationRangeOf(r)!.start_time) : '—'}
                      </Td>
                      <Td className="whitespace-nowrap tabular-nums text-gray-600">
                        {formatDuration(reservationRangeOf(r)?.start_time, reservationRangeOf(r)?.end_time) || '—'}
                      </Td>
                      <Td className="whitespace-nowrap tabular-nums text-right font-semibold text-gray-900">
                        {r.price !== null && r.price !== undefined ? formatRM(r.price) : <span className="text-gray-400 font-medium">—</span>}
                      </Td>
                      <Td>
                        <StatusBadge status={r.status} locale="en" />
                      </Td>
                      <Td className="text-right">
                        <div className="flex justify-end">
                          <ReservationRowActions reservation={r} size="sm" stacked />
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tarjetas (móvil, tablet y portátil estrecho: la tabla de 8 columnas no cabe por debajo de xl) */}
          <div className="xl:hidden flex flex-col gap-4">
            {rows.map((r) => (
              <ReservationMobileCard key={r.id} reservation={r} highlighted={highlightId === r.id} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th scope="col" className={`px-3 py-3 font-semibold ${className}`}>{children}</th>
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-4 ${className}`}>{children}</td>
}
