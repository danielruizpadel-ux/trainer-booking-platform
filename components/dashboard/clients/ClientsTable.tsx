'use client'

import { useMemo, useState } from 'react'
import type { TrainerClient } from '@/lib/clients/queries'

interface ClientsTableProps {
  clients: TrainerClient[]
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(`${value}T12:00:00`),
  )
}

export function ClientsTable({ clients }: ClientsTableProps) {
  const [query, setQuery] = useState('')
  const rows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    if (!needle) return clients
    return clients.filter((client) =>
      [client.name, client.email, client.phone].some((value) => value?.toLocaleLowerCase().includes(needle)),
    )
  }, [clients, query])

  return (
    <section className="mt-6 flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-500">
          {clients.length} {clients.length === 1 ? 'contacto' : 'contactos'}
        </p>
        <label className="relative block sm:w-80">
          <span className="sr-only">Buscar clientes</span>
          <svg className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre o contacto…"
            className="h-10 w-full rounded-xl bg-white pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 ring-1 ring-inset ring-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-gray-200/70">
          <h2 className="text-base font-semibold text-gray-900">
            {clients.length === 0 ? 'Todavía no hay clientes' : 'Ningún cliente coincide'}
          </h2>
          <p className="mt-1.5 text-sm text-gray-600">
            {clients.length === 0 ? 'Cuando tengas una reserva aparecerá aquí.' : `No hay resultados para “${query.trim()}”.`}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-gray-200/70">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/50 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
                  <th className="px-5 py-3">Cliente</th>
                  <th className="px-5 py-3">Contacto</th>
                  <th className="px-5 py-3">Reservas</th>
                  <th className="px-5 py-3">Última reserva</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((client) => (
                  <tr key={`${client.kind}:${client.id}`} className="border-t border-gray-100 align-top">
                    <td className="px-5 py-4">
                      <p className="font-medium text-gray-900">{client.name || 'Sin nombre'}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {client.kind === 'player' ? 'Cuenta de jugador' : 'Invitado'}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-gray-600">
                      <div className="flex flex-col gap-1">
                        {client.email ? <a className="hover:text-gray-900 hover:underline" href={`mailto:${client.email}`}>{client.email}</a> : <span>—</span>}
                        {client.phone && <a className="hover:text-gray-900 hover:underline" href={`tel:${client.phone}`}>{client.phone}</a>}
                      </div>
                    </td>
                    <td className="px-5 py-4 tabular-nums text-gray-900">{client.reservationsCount}</td>
                    <td className="px-5 py-4 text-gray-600">{formatDate(client.lastReservationDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
