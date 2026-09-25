'use client'

import { fieldClass, labelClass } from '@/components/dashboard/DialogShell'

export interface ClientFieldValues {
  client_name: string
  client_email: string
  client_phone: string
  notes: string
}

interface ClientFieldsProps {
  values: ClientFieldValues
  onChange: (values: ClientFieldValues) => void
  disabled?: boolean
  /** Prefijo de los ids, por si hay dos formularios en la página */
  idPrefix?: string
}

/**
 * Nombre, email, teléfono y notas internas. Lo usan editar y nueva reserva.
 * Las notas son del entrenador; el mensaje que escribe el cliente al reservar
 * (client_message) va aparte y no se edita aquí.
 */
export function ClientFields({ values, onChange, disabled = false, idPrefix = 'client' }: ClientFieldsProps) {
  const set = (key: keyof ClientFieldValues) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...values, [key]: event.target.value })

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${idPrefix}-name`} className={labelClass}>
          Nombre
        </label>
        <input id={`${idPrefix}-name`} required value={values.client_name} onChange={set('client_name')} disabled={disabled} className={fieldClass} autoComplete="name" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${idPrefix}-email`} className={labelClass}>
          Email
        </label>
        <input id={`${idPrefix}-email`} type="email" required value={values.client_email} onChange={set('client_email')} disabled={disabled} className={fieldClass} autoComplete="email" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${idPrefix}-phone`} className={labelClass}>
          Teléfono
        </label>
        <input id={`${idPrefix}-phone`} type="tel" value={values.client_phone} onChange={set('client_phone')} disabled={disabled} className={fieldClass} autoComplete="tel" />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <label htmlFor={`${idPrefix}-notes`} className={labelClass}>
          Notas internas
        </label>
        <textarea id={`${idPrefix}-notes`} placeholder="Solo las ves tú" rows={2} value={values.notes} onChange={set('notes')} disabled={disabled} className={`${fieldClass} h-auto py-2.5`} />
      </div>
    </div>
  )
}
