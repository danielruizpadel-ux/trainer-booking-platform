'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

interface ProfileValues {
  full_name: string
  phone: string
  whatsapp_opt_in: boolean
}

interface PlayerProfileFormProps {
  /** onboarding: primera vez, POST /api/player/onboarding y a /cuenta. edit: PATCH /api/player/profile. */
  mode: 'onboarding' | 'edit'
  /** De Supabase Auth; aquí solo se enseña */
  email: string
  initial: ProfileValues
  /**
   * Adónde ir al terminar el onboarding. Lo calcula el servidor (bienvenida:
   * la reserva del entrenador de origen o /cuenta); aquí no se lee de la URL.
   */
  returnTo?: string
}

type FieldErrors = Partial<Record<keyof ProfileValues, string>>

const inputClass =
  'h-12 w-full rounded-xl px-4 text-gray-900 placeholder:text-gray-400 ring-1 ring-inset focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-all duration-150'

/** La validación que manda es la del servidor (lib/players/profile.ts); esta solo evita el viaje en lo obvio. */
function validate(values: ProfileValues): FieldErrors {
  const errors: FieldErrors = {}
  const name = values.full_name.trim()
  if (name.length < 2 || name.length > 80) errors.full_name = 'Escribe tu nombre (entre 2 y 80 caracteres)'
  if (!/^[\d\-+()]{10,}$/.test(values.phone.replace(/\s/g, '')) || values.phone.trim().length > 30) {
    errors.phone = 'Teléfono no válido (mínimo 10 dígitos)'
  }
  return errors
}

export function PlayerProfileForm({ mode, email, initial, returnTo = '/cuenta' }: PlayerProfileFormProps) {
  const router = useRouter()
  const [values, setValues] = useState<ProfileValues>(initial)
  const [saved, setSaved] = useState<ProfileValues>(initial)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  const onboarding = mode === 'onboarding'
  const saving = status === 'saving'
  const dirty =
    values.full_name !== saved.full_name ||
    values.phone !== saved.phone ||
    values.whatsapp_opt_in !== saved.whatsapp_opt_in

  function update<K extends keyof ProfileValues>(field: K, value: ProfileValues[K]) {
    setValues((current) => ({ ...current, [field]: value }))
    setFieldErrors((current) => ({ ...current, [field]: undefined }))
    if (status === 'saved') setStatus('idle')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const errors = validate(values)
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setStatus('saving')
    try {
      const response = await fetch(onboarding ? '/api/player/onboarding' : '/api/player/profile', {
        method: onboarding ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: values.full_name,
          phone: values.phone,
          whatsapp_opt_in: values.whatsapp_opt_in,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) {
        if (data.field === 'full_name' || data.field === 'phone') {
          setFieldErrors({ [data.field]: data.error })
        } else {
          setError(data.error || 'No se pudo guardar')
        }
        setStatus('idle')
        return
      }

      if (onboarding) {
        router.replace(returnTo)
        router.refresh()
        return
      }

      const next: ProfileValues = {
        full_name: data.player.full_name ?? '',
        phone: data.player.phone ?? '',
        whatsapp_opt_in: data.player.whatsapp_opt_in,
      }
      setValues(next)
      setSaved(next)
      setStatus('saved')
      // El nombre de la cabecera sale del servidor.
      router.refresh()
    } catch {
      setError('No se pudo guardar. Revisa tu conexión y vuelve a intentarlo.')
      setStatus('idle')
    }
  }

  return (
    <form onSubmit={submit} noValidate className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-5 sm:p-6">
      <h2 className="text-base font-semibold text-gray-900">{onboarding ? 'Tus datos' : 'Datos personales'}</h2>
      <p className="mt-1 text-sm text-gray-500">
        {onboarding
          ? 'Nombre y teléfono son obligatorios: tu entrenador los usa para confirmarte la clase.'
          : 'Se usarán en tus próximas reservas.'}
      </p>

      <div className="mt-5 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="player-email" className="text-sm font-medium text-gray-900">
            Correo electrónico
          </label>
          <input id="player-email" type="email" value={email} readOnly disabled className={`${inputClass} ring-gray-200`} />
          <p className="text-xs text-gray-400">Es el correo con el que entras; no se cambia desde aquí.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="player-name" className="text-sm font-medium text-gray-900">
            Nombre y apellidos
          </label>
          <input
            id="player-name"
            name="full_name"
            type="text"
            autoComplete="name"
            required
            maxLength={80}
            value={values.full_name}
            onChange={(event) => update('full_name', event.target.value)}
            disabled={saving}
            placeholder="Tu nombre"
            aria-invalid={Boolean(fieldErrors.full_name)}
            aria-describedby={fieldErrors.full_name ? 'player-name-error' : undefined}
            className={`${inputClass} ${fieldErrors.full_name ? 'ring-red-300' : 'ring-gray-200'}`}
          />
          {fieldErrors.full_name && (
            <p id="player-name-error" className="text-sm text-red-600">
              {fieldErrors.full_name}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="player-phone" className="text-sm font-medium text-gray-900">
            Teléfono
          </label>
          <input
            id="player-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            required
            maxLength={30}
            value={values.phone}
            onChange={(event) => update('phone', event.target.value)}
            disabled={saving}
            placeholder="+60 12 345 6789"
            aria-invalid={Boolean(fieldErrors.phone)}
            aria-describedby={fieldErrors.phone ? 'player-phone-error' : undefined}
            className={`${inputClass} tabular-nums ${fieldErrors.phone ? 'ring-red-300' : 'ring-gray-200'}`}
          />
          {fieldErrors.phone && (
            <p id="player-phone-error" className="text-sm text-red-600">
              {fieldErrors.phone}
            </p>
          )}
        </div>

        <label className="flex items-start gap-3 rounded-xl px-4 py-3 ring-1 ring-inset ring-gray-200 hover:ring-blue-400 hover:bg-blue-50/40 cursor-pointer transition-all duration-150">
          <input
            type="checkbox"
            checked={values.whatsapp_opt_in}
            onChange={(event) => update('whatsapp_opt_in', event.target.checked)}
            disabled={saving}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span>
            <span className="block text-sm font-semibold text-gray-900">Avisos por WhatsApp</span>
            <span className="block text-xs text-gray-500">Confirmaciones y cambios de tus clases en este teléfono.</span>
          </span>
        </label>
      </div>

      <div className="mt-6 pt-5 border-t border-gray-100 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3">
        {error && (
          <p role="alert" className="text-sm text-red-600 sm:mr-auto">
            {error}
          </p>
        )}
        {status === 'saved' && !error && <p className="text-xs text-gray-400 sm:mr-auto">Guardado.</p>}
        <button
          type="submit"
          disabled={saving || (!onboarding && !dirty)}
          className="h-12 px-6 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 active:scale-[0.98] shadow-sm shadow-blue-600/25 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none disabled:cursor-not-allowed disabled:active:scale-100"
        >
          {saving ? 'Guardando…' : onboarding ? 'Continuar' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  )
}
