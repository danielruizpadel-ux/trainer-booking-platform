import type { Metadata } from 'next'
import { getProposalByToken } from '@/lib/reservations/proposal'
import { formatDuration, formatTime } from '@/lib/reservations/format'
import { formatRM } from '@/lib/reservations/pricing'
import { formatSessionLabel } from '@/lib/dateUtils'
import { ProposalResponse } from '@/components/proposal/ProposalResponse'

export const metadata: Metadata = {
  title: 'Propuesta de nueva fecha',
  robots: { index: false, follow: false },
}
export const dynamic = 'force-dynamic'

/**
 * Página pública del cliente: sin login, el token de la URL es la
 * autorización. Se muestra una sola vez; al responder el token se anula.
 */
export default async function PropuestaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const proposal = await getProposalByToken(token)

  return (
    <main className="min-h-screen bg-gray-50/50 flex items-center justify-center px-4 sm:px-6 py-16">
      <div className="w-full max-w-md">
        {proposal ? (
          <>
            <div className="mb-8 text-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{proposal.trainer.name}</p>
              <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
                Te proponemos otra fecha
              </h1>
              <p className="mt-1.5 text-gray-500">
                Hola {proposal.client_name.split(/\s+/)[0]}. No hemos conseguido pista para tu clase; ¿te viene
                bien esta?
              </p>
            </div>

            <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-6 sm:p-8 flex flex-col gap-6">
              <div className="rounded-xl bg-blue-50 px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-600/70">Nueva fecha propuesta</p>
                <p className="mt-1 text-lg font-semibold text-gray-900 capitalize">
                  {formatSessionLabel(proposal.slot.session_date, proposal.slot.start_time)}
                </p>
                <p className="text-sm text-gray-600">
                  {formatTime(proposal.slot.start_time)} – {formatTime(proposal.slot.end_time)}
                  {formatDuration(proposal.slot.start_time, proposal.slot.end_time) &&
                    ` · ${formatDuration(proposal.slot.start_time, proposal.slot.end_time)}`}
                  {proposal.price !== null && ` · ${formatRM(proposal.price)}`}
                </p>
              </div>

              <ProposalResponse token={token} trainerSlug={proposal.trainer.slug} />
            </div>
          </>
        ) : (
          <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-6 sm:p-8 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Este enlace ya no es válido</h1>
            <p className="mt-1.5 text-sm text-gray-600">
              Puede que ya hayas respondido a la propuesta, o que el enlace esté incompleto. Si tienes dudas,
              escribe a tu entrenador.
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
