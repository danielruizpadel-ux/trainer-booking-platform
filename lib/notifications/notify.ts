import { getSupabaseServerClient } from '@/lib/supabase/client'

/**
 * Notificaciones al cliente. Por ahora son un STUB: no hay proveedor de email
 * (eso es la última fase, cuando haya dominio propio). Lo que sí hacen es
 * dejar constancia de la intención en `email_logs` (y en `whatsapp_logs` si el
 * cliente marcó WhatsApp), con `status = 'skipped'`, para que al integrar el
 * proveedor se vea qué se debería haber enviado.
 *
 * Esquema real (docs/DATABASE.md):
 *   email_logs:    reservation_id, recipient_email, subject, status, error_message
 *   whatsapp_logs: reservation_id, phone_number, message, status, error_message
 *
 * Nunca lanzan: una notificación fallida no puede tumbar la confirmación.
 *
 * TODO(fase final): integrar Resend
 */

export interface NotifiableReservation {
  id: string
  client_name: string
  client_email: string
  client_phone?: string | null
  notes?: string | null
  /** YYYY-MM-DD */
  session_date?: string | null
  /** HH:MM o HH:MM:SS */
  start_time?: string | null
}

const STUB_STATUS = 'skipped'
const STUB_REASON = 'Sin proveedor de email (stub Fase C). TODO(fase final): integrar Resend'

export async function notifyReservationConfirmed(reservation: NotifiableReservation) {
  await record(reservation, {
    subject: `Clase confirmada: ${sessionLabel(reservation)}`,
    whatsapp: `Hola ${reservation.client_name}, tu clase del ${sessionLabel(reservation)} está confirmada. ¡Nos vemos en la pista!`,
  })
}

export async function notifyReservationNeedsReschedule(reservation: NotifiableReservation) {
  await record(reservation, {
    subject: `No hemos conseguido pista para el ${sessionLabel(reservation)}: elige otra hora`,
    whatsapp: `Hola ${reservation.client_name}, no hemos conseguido pista para el ${sessionLabel(reservation)}. ¿Puedes elegir otra hora desde la web?`,
  })
}

/** Propuesta de nueva fecha: el enlace va en el asunto para que quede en el log. */
export async function notifyRescheduleProposed(reservation: NotifiableReservation, link: string) {
  await record(reservation, {
    subject: `Te proponemos otra fecha: ${sessionLabel(reservation)} — responde en ${link}`,
    whatsapp: `Hola ${reservation.client_name}, no hemos conseguido pista para tu clase. ¿Te viene bien el ${sessionLabel(reservation)}? Acepta o elige otra hora aquí: ${link}`,
  })
}

export async function notifyProposalResponded(reservation: NotifiableReservation, accepted: boolean) {
  await record(
    reservation,
    accepted
      ? {
          subject: `Has aceptado el ${sessionLabel(reservation)}: te confirmamos en cuanto tengamos la pista`,
          whatsapp: `Gracias ${reservation.client_name}, tu clase del ${sessionLabel(reservation)} queda pendiente de que reservemos la pista.`,
        }
      : {
          subject: `Has pedido otra hora: elige la que prefieras desde la web`,
          whatsapp: `Sin problema ${reservation.client_name}, elige otra hora desde la web y te la confirmamos.`,
        }
  )
}

/** Cancelación directa por el entrenador (ya ha hablado con el cliente). */
export async function notifyReservationCancelled(reservation: NotifiableReservation) {
  await record(reservation, {
    subject: `Tu clase del ${sessionLabel(reservation)} ha sido cancelada`,
    whatsapp: `Hola ${reservation.client_name}, tu clase del ${sessionLabel(reservation)} queda cancelada. Cuando quieras, reserva otra desde la web.`,
  })
}

/** Cambio de horario hecho por el entrenador desde el panel. */
export async function notifyReservationMoved(reservation: NotifiableReservation) {
  await record(reservation, {
    subject: `Tu clase pasa al ${sessionLabel(reservation)}`,
    whatsapp: `Hola ${reservation.client_name}, tu clase queda ahora el ${sessionLabel(reservation)}.`,
  })
}

function sessionLabel(reservation: NotifiableReservation): string {
  const time = (reservation.start_time ?? '').slice(0, 5)
  return [reservation.session_date, time].filter(Boolean).join(' ') || 'tu sesión'
}

/** El widget guarda "WhatsApp: si" / "WhatsApp: no" en `notes`. */
function wantsWhatsApp(reservation: NotifiableReservation): boolean {
  return /whatsapp:\s*si/i.test(reservation.notes ?? '') && Boolean(reservation.client_phone)
}

async function record(
  reservation: NotifiableReservation,
  content: { subject: string; whatsapp: string }
) {
  console.log(`[notify:stub] email → ${reservation.client_email}: "${content.subject}"`)

  try {
    const supabase = getSupabaseServerClient()

    const { error: emailError } = await supabase.from('email_logs').insert({
      reservation_id: reservation.id,
      recipient_email: reservation.client_email,
      subject: content.subject,
      status: STUB_STATUS,
      error_message: STUB_REASON,
    })
    if (emailError) console.warn('[notify:stub] no se pudo registrar en email_logs:', emailError.message)

    if (wantsWhatsApp(reservation)) {
      console.log(`[notify:stub] whatsapp → ${reservation.client_phone}`)
      const { error: waError } = await supabase.from('whatsapp_logs').insert({
        reservation_id: reservation.id,
        phone_number: reservation.client_phone,
        message: content.whatsapp,
        status: STUB_STATUS,
        error_message: STUB_REASON,
      })
      if (waError) console.warn('[notify:stub] no se pudo registrar en whatsapp_logs:', waError.message)
    }
  } catch (error) {
    console.warn('[notify:stub] error inesperado:', error)
  }
}
