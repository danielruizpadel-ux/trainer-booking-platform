'use client'

import { useState } from 'react'
import type { ClientPackageSummary } from '@/lib/packages/queries'
import { PackageDetailDialog } from './PackageDetailDialog'
import { durationLabel } from '@/lib/availability/durations'
import { formatRM } from '@/lib/reservations/pricing'

interface PackagesTableProps {
  packages: ClientPackageSummary[]
}

const STATUS_LABEL: Record<ClientPackageSummary['status'], { label: string; tone: string }> = {
  active: { label: 'Activo', tone: 'bg-blue-50 text-blue-700' },
  completed: { label: 'Completado', tone: 'bg-emerald-50 text-emerald-700' },
  cancelled: { label: 'Cancelado', tone: 'bg-gray-100 text-gray-600' },
}

/** Una fila por paquete; clic abre el detalle con sus sesiones. */
export function PackagesTable({ packages }: PackagesTableProps) {
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <>
      <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/50 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
                <th scope="col" className="px-4 py-3 font-semibold">Cliente</th>
                <th scope="col" className="px-4 py-3 font-semibold">Paquete</th>
                <th scope="col" className="px-4 py-3 font-semibold">Sesiones</th>
                <th scope="col" className="px-4 py-3 font-semibold text-right hidden sm:table-cell">Precio</th>
                <th scope="col" className="px-4 py-3 font-semibold">Estado</th>
                <th scope="col" className="px-4 py-3 font-semibold text-right"><span className="sr-only">Abrir</span></th>
              </tr>
            </thead>
            <tbody>
              {packages.map((p) => {
                const status = STATUS_LABEL[p.status] ?? STATUS_LABEL.active
                const pending = p.sessions_total - p.sessions_scheduled
                return (
                  <tr
                    key={p.id}
                    onClick={() => setOpenId(p.id)}
                    className="border-t border-gray-100 hover:bg-gray-50/50 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-4">
                      <p className="font-medium text-gray-900">{p.client_name}</p>
                      <p className="text-gray-500 truncate max-w-[14rem]" title={p.client_email}>{p.client_email}</p>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-gray-900">
                      {p.sessions_total} clases · {durationLabel(p.duration_minutes ?? 60)}
                      {p.discount_percent > 0 && <span className="text-emerald-600"> · −{p.discount_percent} %</span>}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className="tabular-nums text-gray-900">{p.sessions_scheduled}/{p.sessions_total}</span>
                      <span className="text-gray-500"> agendadas</span>
                      {pending > 0 && p.status === 'active' && (
                        <span className="block text-xs text-gray-400">{pending} por agendar</span>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-right font-semibold text-gray-900 tabular-nums hidden sm:table-cell">
                      {formatRM(p.price_total)}
                    </td>
                    <td className="px-4 py-4">
                      <span className={`h-7 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center whitespace-nowrap ${status.tone}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          setOpenId(p.id)
                        }}
                        className="h-9 px-3 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors whitespace-nowrap"
                      >
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {openId && <PackageDetailDialog packageId={openId} onClose={() => setOpenId(null)} />}
    </>
  )
}
