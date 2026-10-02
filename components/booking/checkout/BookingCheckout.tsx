'use client'

import { useMemo, useState, type FormEvent } from 'react'
import type { BookingAccount, BookingPlayer } from '@/lib/players/booking-contact'
import { PLAYER_COUNTS, basePriceFor, formatRMEn, quoteBooking, type SessionPriceRow } from '@/lib/reservations/pricing'
import { CLIENT_MESSAGE_MAX, codePointLength, normalizeClientMessage } from '@/lib/reservations/client-message'
import { formatDurationEn, formatSessionDateEn, formatSessionTimeEn } from '@/lib/booking/format-en'
import { browserDraftStorage, createDraft, saveDraft } from '@/lib/booking/draft'
import { UNCONFIRMED_BOOKING_MESSAGE } from '@/lib/reservations/idempotency-client'
import { classifyBookingError, type BookingErrorKind } from '@/lib/booking/checkout-error'

export interface CheckoutSession {
  date: string
  time: string
}

export interface GuestDetails {
  name: string
  email: string
  phone: string
  whatsapp: boolean
}

/** Lo que el checkout entrega a BookingFlow. Ni precio ni identidad: los pone el servidor. */
export interface CheckoutSubmit {
  playerCount: number
  clientMessage: string
  guest: GuestDetails | null
}

export class CheckoutError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

interface BookingCheckoutProps {
  trainerName: string
  trainerSlug?: string
  trainerImageUrl?: string | null
  sessions: CheckoutSession[]
  duration: number
  prices: SessionPriceRow[] | null
  pricesError: string | null
  playerCount: number
  onPlayerCountChange: (count: number) => void
  account: BookingAccount
  /** Aviso al volver del login (p. ej. sesiones que ya no estaban libres) */
  notice?: string | null
  onBack: () => void
  /** Lanza CheckoutError si el servidor rechaza la reserva */
  onSubmit: (payload: CheckoutSubmit) => Promise<void>
  variant?: 'default' | 'editorial'
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const formatSessionDateEs = (date: string) => { const [y, m, d] = date.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }) }
const formatDurationEs = (minutes: number) => minutes === 60 ? '1 h' : '1 h 30 min'
const PHONE_RE = /^[\d\s\-+()]{10,}$/

const card = 'bg-white rounded-2xl ring-1 ring-gray-200/70 p-5 sm:p-6'
const eyebrow = 'text-xs font-semibold uppercase tracking-wider text-gray-400'
const inputClass =
  'h-12 w-full rounded-xl px-4 text-gray-900 placeholder:text-gray-400 ring-1 ring-inset focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400 transition-all duration-150'
const primaryButton =
  'h-14 w-full rounded-xl bg-blue-600 text-white text-base font-semibold hover:bg-blue-700 active:scale-[0.98] shadow-sm shadow-blue-600/25 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none disabled:cursor-not-allowed disabled:active:scale-100'
const secondaryButton =
  'h-12 w-full rounded-xl bg-white text-gray-900 font-semibold ring-1 ring-inset ring-gray-200 hover:ring-gray-300 hover:bg-gray-50 active:scale-[0.98] transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2'

/**
 * Checkout (Fase A2), en inglés. Una sola pantalla después de elegir
 * sesiones: sesión → nº de jugadores → quién reserva → mensaje → total →
 * confirmar. Los precios son una vista previa con la tabla del entrenador;
 * el servidor recalcula todo al confirmar.
 */
export function BookingCheckout({
  trainerName,
  trainerSlug,
  trainerImageUrl,
  sessions,
  duration,
  prices,
  pricesError,
  playerCount,
  onPlayerCountChange,
  account,
  notice,
  onBack,
  onSubmit,
  variant = 'default',
}: BookingCheckoutProps) {
  const editorial = variant === 'editorial'
  const tr = (es: string, en: string) => editorial ? es : en
  const cardStyle = editorial ? 'rounded-lg bg-[#F7FAFA] p-5 ring-1 ring-[#B9CCD2] sm:p-6' : card
  const eyebrowStyle = editorial ? 'font-mauri-display text-xs font-bold uppercase tracking-[0.15em] text-[#32677B]' : eyebrow
  const buttonStyle = editorial ? 'h-14 w-full rounded-md bg-[#32677B] font-mauri-display text-lg font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#20374D] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#32677B] disabled:cursor-not-allowed disabled:opacity-40' : primaryButton
  const secondStyle = editorial ? 'h-12 w-full rounded-md border border-[#32677B] bg-transparent font-mauri-display font-bold uppercase tracking-wider text-[#20374D] hover:bg-[#D6E3E6]' : secondaryButton
  const [guest, setGuest] = useState<GuestDetails>({ name: '', email: '', phone: '', whatsapp: false })
  const [touched, setTouched] = useState<Partial<Record<keyof GuestDetails, boolean>>>({})
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<{ message: string; kind: BookingErrorKind } | null>(null)
  const [done, setDone] = useState<{ total: number } | null>(null)

  const player = account.kind === 'player' ? account.player : null
  const isGuest = account.kind === 'anonymous'
  const quote = useMemo(
    () => (prices ? quoteBooking(prices, sessions.length, duration, playerCount) : null),
    [prices, sessions.length, duration, playerCount]
  )
  const messageLength = codePointLength(normalizeClientMessage(message))
  const messageTooLong = messageLength > CLIENT_MESSAGE_MAX

  const guestErrors = {
    name: guest.name.trim().length < 3 ? tr('Escribe tu nombre completo', 'Enter your full name') : null,
    email: EMAIL_RE.test(guest.email.trim()) ? null : tr('Escribe un email válido', 'Enter a valid email'),
    phone: PHONE_RE.test(guest.phone.replace(/\s/g, '')) ? null : tr('Escribe un teléfono válido (al menos 10 dígitos)', 'Enter a valid phone number (at least 10 digits)'),
  }
  const guestValid = !guestErrors.name && !guestErrors.email && !guestErrors.phone

  const canConfirm =
    !submitting &&
    quote !== null &&
    !messageTooLong &&
    (account.kind === 'player' || (isGuest && guestValid))

  /** Guarda el borrador NO sensible y va a entrar / completar el perfil. */
  function goToAccount(path: '/cuenta/entrar' | '/cuenta/bienvenida') {
    if (!trainerSlug) return
    const params = new URLSearchParams({ trainer: trainerSlug })
    const storage = browserDraftStorage()
    if (storage && typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      const draft = createDraft(
        {
          draftId: crypto.randomUUID(),
          trainerSlug,
          sessions: sessions.map((s) => ({ date: s.date, time: s.time.slice(0, 5) })),
          duration,
          playerCount,
        },
        Date.now()
      )
      if (saveDraft(storage, draft, Date.now())) params.set('draft', draft.draftId)
    }
    window.location.assign(`${path}?${params.toString()}`)
  }

  async function confirm(event: FormEvent) {
    event.preventDefault()
    setTouched({ name: true, email: true, phone: true })
    if (!canConfirm || !quote) return
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit({ playerCount, clientMessage: message, guest: isGuest ? guest : null })
      setDone({ total: quote.total })
    } catch (err) {
      const status = err instanceof CheckoutError ? err.status : 0
      const original = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
      const kind = classifyBookingError(status, original)
      setError({
        message: editorial
          ? original === UNCONFIRMED_BOOKING_MESSAGE
            ? 'No hemos podido comprobar si se recibió tu solicitud. Revisa tus reservas; si vuelves a enviarla sin cambiar los datos, no se duplicará.'
            : kind === 'slot'
              ? 'Esta hora ya no está disponible. Elige otra.'
              : kind === 'profile'
                ? 'Completa tu perfil de jugador para solicitar con tu cuenta.'
                : kind === 'price'
                  ? 'No hay precio configurado para esta clase. Prueba otra duración o consulta con Mauri.'
                  : 'No se pudo completar la solicitud. Revisa los datos e inténtalo de nuevo.'
          : original,
        kind,
      })
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <CheckoutSuccess
        trainerName={trainerName}
        trainerSlug={trainerSlug}
        sessions={sessions}
        duration={duration}
        playerCount={playerCount}
        total={done.total}
        guest={isGuest}
        editorial={editorial}
      />
    )
  }

  return (
    <section className={editorial ? "bg-[#E7EFF0] px-4 py-10 text-[#20374D] sm:px-6 sm:py-14 lg:px-8" : "py-10 sm:py-14 px-4 sm:px-6 lg:px-8 bg-gray-50/50"}>
      <form onSubmit={confirm} noValidate className="max-w-5xl mx-auto">
        <header className="mb-8">
          <button
            type="button"
            onClick={onBack}
            className="h-9 -ml-3 px-3 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors inline-flex items-center gap-1.5"
          >
            <ChevronLeft />
            {tr('Cambiar clases', 'Change sessions')}
          </button>
          <h2 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">{tr('Revisa tu solicitud', 'Review your booking')}</h2>
          <p className="mt-1.5 text-gray-500">{tr('Comprueba los datos. Es una solicitud: Mauri confirma la clase cuando reserve la pista.', 'Check the details and confirm. The coach confirms once the court is booked.')}</p>
        </header>

        {notice && (
          <p role="status" className="mb-6 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-700">
            {notice}
          </p>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
          <div className="flex flex-col gap-6">
            {/* Coach + sessions */}
            <div className={cardStyle}>
              <div className="flex items-center gap-4">
                <CoachAvatar name={trainerName} imageUrl={trainerImageUrl} />
                <div className="min-w-0">
                  <p className={eyebrowStyle}>{tr('Tu entrenador', 'Your coach')}</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900 truncate">{trainerName}</p>
                </div>
              </div>
              <ul className="mt-5 divide-y divide-gray-100 border-t border-gray-100">
                {sessions.map((s) => (
                  <li key={`${s.date}-${s.time}`} className="py-3.5 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{editorial ? formatSessionDateEs(s.date) : formatSessionDateEn(s.date)}</p>
                      <p className="mt-0.5 text-sm text-gray-500 tabular-nums">{editorial ? s.time.slice(0, 5) : formatSessionTimeEn(s.time)}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-gray-50 px-3 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-200">
                      {editorial ? formatDurationEs(duration) : formatDurationEn(duration)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Number of players */}
            <div className={cardStyle}>
              <p className={eyebrowStyle}>{tr('Número de jugadores', 'Number of players')}</p>
              <div role="radiogroup" aria-label={tr("Número de jugadores", "Number of players")} className="mt-4 grid grid-cols-4 gap-2 sm:gap-3">
                {PLAYER_COUNTS.map((n) => {
                  const price = prices ? basePriceFor(prices, duration, n) : null
                  const selected = playerCount === n
                  return (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={price === null || submitting}
                      onClick={() => onPlayerCountChange(n)}
                      className={`rounded-xl py-3.5 px-2 flex flex-col items-center gap-1 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:bg-gray-100 disabled:text-gray-400 disabled:ring-0 disabled:cursor-not-allowed ${
                        selected
                          ? editorial ? 'bg-[#32677B] text-white' : 'bg-blue-600 text-white shadow-sm shadow-blue-600/25'
                          : 'bg-white text-gray-900 ring-1 ring-inset ring-gray-200 hover:ring-blue-400 hover:bg-blue-50/60 active:scale-[0.98]'
                      }`}
                    >
                      <span className="text-xl font-bold tabular-nums">{n}</span>
                      <span className={`text-xs tabular-nums ${selected ? 'text-white/80' : 'text-gray-500'}`}>
                        {price === null ? (prices ? tr('No disponible', 'N/A') : '…') : formatRMEn(price)}
                      </span>
                    </button>
                  )
                })}
              </div>
              <p className="mt-3 text-xs text-gray-400">{tr('Precio por clase para todo el grupo.', 'Price per session for the whole group.')}</p>
            </div>

            {/* Who is booking */}
            <div className={cardStyle}>
              {account.kind === 'player' && player && <BookingAs player={player} editorial={editorial} />}
              {account.kind === 'loading' && <p className="text-sm text-gray-500">{tr('Comprobando tu cuenta…', 'Checking your account…')}</p>}
              {account.kind === 'incomplete' && (
                <div className="flex flex-col gap-4">
                  <div>
                    <p className={eyebrowStyle}>{tr('Reservas como', 'Booking as')}</p>
                    <p className="mt-2 text-sm text-gray-600">
                      {tr('Has entrado, pero falta completar tu perfil. Añade tu nombre y teléfono y volverás a esta solicitud.', "You're signed in, but your player profile isn't complete. Add your name and phone once and you'll come straight back here.")}
                    </p>
                  </div>
                  <button type="button" onClick={() => goToAccount('/cuenta/bienvenida')} className={secondStyle}>
                    {tr('Completar perfil', 'Complete my profile')}
                  </button>
                </div>
              )}
              {isGuest && (
                <div className="flex flex-col gap-5">
                  {trainerSlug && (
                    <>
                      <button type="button" onClick={() => goToAccount('/cuenta/entrar')} className={secondStyle}>
                        {tr('Entrar en mi cuenta', 'Continue with my account')}
                      </button>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 border-t border-gray-100" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">{tr("o", "or")}</span>
                        <div className="flex-1 border-t border-gray-100" />
                      </div>
                    </>
                  )}
                  <div>
                    <p className={eyebrowStyle}>{tr('Tus datos', 'Your details')}</p>
                    <div className="mt-4 flex flex-col gap-4">
                      <Field
                        id="guest-name"
                        label={tr("Nombre", "Name")}
                        autoComplete="name"
                        value={guest.name}
                        onChange={(v) => setGuest({ ...guest, name: v })}
                        onBlur={() => setTouched({ ...touched, name: true })}
                        error={touched.name ? guestErrors.name : null}
                        disabled={submitting}
                      />
                      <Field
                        id="guest-email"
                        label={tr("Email", "Email")}
                        type="email"
                        autoComplete="email"
                        value={guest.email}
                        onChange={(v) => setGuest({ ...guest, email: v })}
                        onBlur={() => setTouched({ ...touched, email: true })}
                        error={touched.email ? guestErrors.email : null}
                        disabled={submitting}
                      />
                      <Field
                        id="guest-phone"
                        label={tr("Teléfono", "Phone")}
                        type="tel"
                        autoComplete="tel"
                        value={guest.phone}
                        onChange={(v) => setGuest({ ...guest, phone: v })}
                        onBlur={() => setTouched({ ...touched, phone: true })}
                        error={touched.phone ? guestErrors.phone : null}
                        disabled={submitting}
                      />
                      <label className="flex items-start gap-3 rounded-xl px-4 py-3 ring-1 ring-inset ring-gray-200 hover:ring-blue-400 hover:bg-blue-50/40 cursor-pointer transition-all duration-150">
                        <input
                          type="checkbox"
                          checked={guest.whatsapp}
                          onChange={(event) => setGuest({ ...guest, whatsapp: event.target.checked })}
                          disabled={submitting}
                          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>
                          <span className="block text-sm font-semibold text-gray-900">{tr("Mauri puede contactarte por WhatsApp", "Your coach can contact you on WhatsApp")}</span>
                          <span className="block text-xs text-gray-500">{tr("Solo para confirmar o cambiar esta solicitud.", "About the confirmation and changes to this booking only.")}</span>
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Message to coach */}
            <div className={cardStyle}>
              <label htmlFor="coach-message" className={eyebrowStyle}>
                {tr('Mensaje a Mauri', 'Message to coach')} <span className="normal-case tracking-normal font-medium">{tr('(opcional)', '(optional)')}</span>
              </label>
              <textarea
                id="coach-message"
                rows={4}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                disabled={submitting || account.kind === 'incomplete' || account.kind === 'loading'}
                placeholder={tr("Por ejemplo, quiero trabajar la bandeja.", "E.g. I'd like to work on my bandeja, or I'll arrive 5 minutes late.")}
                aria-describedby="coach-message-count"
                className={`mt-3 w-full rounded-xl px-4 py-3 text-gray-900 placeholder:text-gray-400 ring-1 ring-inset focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 resize-y ${
                  messageTooLong ? 'ring-red-300' : 'ring-gray-200'
                }`}
              />
              <p id="coach-message-count" className={`mt-2 text-xs tabular-nums ${messageTooLong ? 'text-red-600' : 'text-gray-400'}`}>
                {messageLength}/{CLIENT_MESSAGE_MAX}
              </p>
            </div>
          </div>

          {/* Order summary */}
          <aside className={`${card} lg:sticky lg:top-6`}>
            <p className={eyebrowStyle}>{tr('Resumen de la solicitud', 'Order summary')}</p>
            {quote ? (
              <div className="mt-4 flex flex-col gap-2.5 text-sm">
                <div className="flex justify-between gap-3 text-gray-600">
                  <span>
                    {sessions.length} {sessions.length === 1 ? tr('clase', 'session') : tr('clases', 'sessions')} × {formatRMEn(quote.pricePerSession)}
                  </span>
                  <span className="tabular-nums">{formatRMEn(quote.subtotal)}</span>
                </div>
                <div className="flex justify-between gap-3 text-gray-600">
                  <span>{tr('Jugadores', 'Players')}</span>
                  <span className="tabular-nums">{playerCount}</span>
                </div>
                {quote.discountPercent > 0 && (
                  <div className="flex justify-between gap-3 font-medium text-emerald-600">
                    <span>{tr('Descuento por varias clases', 'Multi-session discount')} ({quote.discountPercent}%)</span>
                    <span className="tabular-nums">−{formatRMEn(Math.round((quote.subtotal - quote.total) * 100) / 100)}</span>
                  </div>
                )}
                <div className="mt-2 pt-4 border-t border-gray-100 flex items-baseline justify-between gap-3">
                  <span className="text-base font-semibold text-gray-900">{tr('Total estimado', 'Total')}</span>
                  <span className="text-3xl font-bold text-gray-900 tabular-nums">{formatRMEn(quote.total)}</span>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-gray-500">
                {pricesError ?? (prices ? tr('No hay precio configurado para esta clase.', "This coach hasn't set a price for this session yet.") : tr('Cargando precios…', 'Loading prices…'))}
              </p>
            )}

            <p className={editorial ? "mt-5 border-t border-[#B9CCD2] pt-4 text-sm text-[#32677B]" : "hidden"}>La pista está incluida en el precio. Esta es una solicitud: Mauri confirmará la pista antes de que la reserva sea definitiva.</p>
            <button type="submit" disabled={!canConfirm} className={`mt-6 ${buttonStyle}`}>
              {submitting ? tr('Enviando solicitud…', 'Confirming…') : tr('Solicitar reserva', 'Confirm booking')}
            </button>

            {error && (
              <div role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3">
                <p className="text-sm text-red-700">{error.message}</p>
                {error.kind === 'slot' && (
                  <button type="button" onClick={onBack} className="mt-2 text-sm font-semibold text-red-700 underline underline-offset-2">
                    {tr('Elegir otra hora', 'Choose another time')}
                  </button>
                )}
                {error.kind === 'profile' && trainerSlug && (
                  <button type="button" onClick={() => goToAccount('/cuenta/bienvenida')} className="mt-2 text-sm font-semibold text-red-700 underline underline-offset-2">
                    {tr('Completar perfil', 'Complete profile')}
                  </button>
                )}
              </div>
            )}
          </aside>
        </div>
      </form>
    </section>
  )
}

function BookingAs({ player, editorial }: { player: BookingPlayer; editorial: boolean }) {
  const tr = (es: string, en: string) => editorial ? es : en
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{tr('Reservas como', 'Booking as')}</p>
      <p className="mt-3 text-base font-semibold text-gray-900">{player.full_name}</p>
      <p className="mt-1 text-sm text-gray-600 break-all">{player.email}</p>
      <p className="mt-0.5 text-sm text-gray-600 tabular-nums">{player.phone}</p>
      <p className="mt-3 inline-flex items-center gap-2 text-sm text-gray-600">
        {player.whatsapp_opt_in ? (
          <>
            <span className="h-5 w-5 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </span>
            {tr('Acepta contacto por WhatsApp', 'OK to contact on WhatsApp')}
          </>
        ) : (
          <>
            <span className="h-5 w-5 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </span>
            {tr('Sin contacto por WhatsApp', 'No WhatsApp contact')}
          </>
        )}
      </p>
    </div>
  )
}

function Field(props: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  onBlur: () => void
  error: string | null
  disabled: boolean
  type?: string
  autoComplete?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={props.id} className="text-sm font-medium text-gray-900">
        {props.label}
      </label>
      <input
        id={props.id}
        type={props.type ?? 'text'}
        autoComplete={props.autoComplete}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        onBlur={props.onBlur}
        disabled={props.disabled}
        aria-invalid={Boolean(props.error)}
        aria-describedby={props.error ? `${props.id}-error` : undefined}
        className={`${inputClass} ${props.error ? 'ring-red-300' : 'ring-gray-200'}`}
      />
      {props.error && (
        <p id={`${props.id}-error`} className="text-sm text-red-600">
          {props.error}
        </p>
      )}
    </div>
  )
}

function CoachAvatar({ name, imageUrl }: { name: string; imageUrl?: string | null }) {
  const [failed, setFailed] = useState(false)
  if (imageUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- avatar pequeño; la URL puede ser externa
      <img src={imageUrl} alt="" onError={() => setFailed(true)} className="h-14 w-14 rounded-2xl object-cover ring-1 ring-gray-200/70 shrink-0" />
    )
  }
  return (
    <span className="h-14 w-14 rounded-2xl bg-blue-50 text-blue-600 text-lg font-semibold flex items-center justify-center shrink-0">
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}

function ChevronLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}

function CheckoutSuccess({
  trainerName,
  trainerSlug,
  sessions,
  duration,
  playerCount,
  total,
  guest,
  editorial,
}: {
  trainerName: string
  trainerSlug?: string
  sessions: CheckoutSession[]
  duration: number
  playerCount: number
  total: number
  guest: boolean
  editorial: boolean
}) {
  const tr = (es: string, en: string) => editorial ? es : en
  return (
    <section className={editorial ? 'bg-[#E7EFF0] px-4 py-12 text-[#20374D] sm:px-6 sm:py-16 lg:px-8' : 'py-12 sm:py-16 px-4 sm:px-6 lg:px-8 bg-gray-50/50'}>
      <div className="max-w-xl mx-auto flex flex-col gap-6">
        <div className={`${editorial ? 'rounded-lg bg-[#F7FAFA] p-6 ring-1 ring-[#B9CCD2]' : card} text-center`}>
          <div className="mx-auto h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <h2 className="mt-4 text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">{tr("Solicitud recibida", "Booking request received")}</h2>
          <p className="mt-1.5 text-gray-500">
            {editorial ? `Tu solicitud está pendiente. La clase solo quedará confirmada cuando ${trainerName} haya reservado la pista.` : `Your request is pending. The class is confirmed only after ${trainerName} books the court.`}
          </p>
          <ul className="mt-6 divide-y divide-gray-100 border-y border-gray-100 text-left">
            {sessions.map((s) => (
              <li key={`${s.date}-${s.time}`} className="py-3 flex justify-between gap-4 text-sm">
                <span className="font-medium text-gray-900">{editorial ? formatSessionDateEs(s.date) : formatSessionDateEn(s.date)}</span>
                <span className="text-gray-500 tabular-nums">
                  {editorial ? s.time.slice(0, 5) : formatSessionTimeEn(s.time)} · {editorial ? formatDurationEs(duration) : formatDurationEn(duration)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-baseline justify-between text-sm">
            <span className="text-gray-500">
              {playerCount} {playerCount === 1 ? tr('jugador', 'player') : tr('jugadores', 'players')} · {tr('pendiente de confirmación', 'pending confirmation')}
            </span>
            <span className="text-xl font-bold text-gray-900 tabular-nums">{formatRMEn(total)}</span>
          </div>
        </div>

        {guest && trainerSlug && (
          <div className={editorial ? 'rounded-lg bg-[#F7FAFA] p-6 ring-1 ring-[#B9CCD2]' : card}>
            <p className="text-base font-semibold text-gray-900">{tr("Activa tu cuenta de jugador", "Activate your player account")}</p>
            <p className="mt-1 text-sm text-gray-500">{tr("La próxima vez podrás reservar más rápido con tu cuenta.", "Book faster next time with one account for all your coaches. No password needed.")}</p>
            <a
              href={`/cuenta/entrar?trainer=${encodeURIComponent(trainerSlug)}`}
              className="mt-4 inline-flex h-11 px-5 items-center rounded-xl bg-white text-gray-900 text-sm font-semibold ring-1 ring-inset ring-gray-200 hover:ring-gray-300 hover:bg-gray-50 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              {tr("Activar cuenta", "Activate account")}
            </a>
          </div>
        )}
      </div>
    </section>
  )
}
