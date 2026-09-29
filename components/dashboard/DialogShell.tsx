'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface DialogShellProps {
  title: string
  eyebrow?: string
  description?: string
  onClose: () => void
  /** Mientras es true no se cierra con Escape ni con el fondo */
  locked?: boolean
  footer?: React.ReactNode
  children: React.ReactNode
  size?: 'md' | 'lg'
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Diálogos abiertos, el último arriba. Solo el de arriba atiende Escape y Tab:
 * con uno encima de otro (el selector de horas dentro de "Nueva reserva"),
 * Escape cierra solo el de arriba.
 */
const openDialogs: HTMLElement[] = []
/** A dónde devuelve el foco cada diálogo abierto (para encadenar, ver abajo). */
const returnTargets = new WeakMap<HTMLElement, HTMLElement | null>()

/**
 * Al cerrar, ¿hay que devolver el foco? Sí si seguía en cualquier parte del
 * diálogo (el fondo incluido) o se perdió al desmontar: en body o en un nodo
 * ya desconectado (según el navegador, activeElement puede seguir apuntando
 * al elemento quitado). Si ya está en otro sitio de la página, no se toca.
 */
export function focusWasInDialog(active: Element | null, root: Node, body: Element): boolean {
  return !active || active === body || !active.isConnected || root.contains(active)
}

/**
 * Diálogo modal del dashboard: hoja inferior en móvil, ventana centrada en sm+.
 *
 * Foco: al abrir va a lo marcado con `data-autofocus` o, si no hay, al primer
 * control del contenido (si no tiene ninguno, al propio diálogo). Tab y
 * Shift+Tab dan la vuelta dentro; Escape cierra (salvo `locked`). Al cerrar,
 * el foco vuelve a lo que lo tenía al abrir (el botón que lo abrió; si venía
 * de un ActionsMenu, su botón, porque el menú lo devuelve antes de abrir).
 */
export function DialogShell({ title, eyebrow, description, onClose, locked = false, footer, children, size = 'lg' }: DialogShellProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  // Se captura en el primer render, antes de mover el foco (y una sola vez,
  // aunque StrictMode repita el efecto).
  const [returnTo] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null)
  )
  // Si se abre desde DENTRO de otro diálogo que se cierra a la vez (la
  // rejilla de horas → "Nueva reserva"), el botón de origen desaparece:
  // entonces se hereda el destino de ese diálogo. Se mira aquí, en el render,
  // porque en el efecto el otro ya se ha desmontado.
  const [inherited] = useState<HTMLElement | null>(() => {
    const opener = openDialogs.find((d) => returnTo && d.contains(returnTo))
    return opener ? (returnTargets.get(opener) ?? null) : null
  })
  // onClose suele ser una flecha nueva en cada render: se lee de un ref para
  // que el efecto de montaje no se repita (y no robe el foco al escribir).
  const latest = useRef({ onClose, locked })
  useLayoutEffect(() => {
    latest.current = { onClose, locked }
  })

  useEffect(() => {
    const root = rootRef.current
    const panel = panelRef.current
    if (!root || !panel) return
    returnTargets.set(panel, returnTo?.isConnected ? returnTo : inherited)
    openDialogs.push(panel)
    const isTop = () => openDialogs[openDialogs.length - 1] === panel
    const focusables = () => [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0)

    const initial =
      panel.querySelector<HTMLElement>('[data-autofocus]') ?? bodyRef.current?.querySelector<HTMLElement>(FOCUSABLE) ?? panel
    initial.focus()

    function onKey(event: KeyboardEvent) {
      if (!isTop()) return
      if (event.key === 'Escape') {
        if (latest.current.locked) return
        event.preventDefault()
        latest.current.onClose()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables()
      const active = document.activeElement
      if (items.length === 0) {
        event.preventDefault()
        panel!.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (!panel!.contains(active)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      } else if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    // Si algo saca el foco fuera (un clic en el fondo, un elemento que
    // desaparece), vuelve dentro del diálogo de arriba.
    function onFocusIn(event: FocusEvent) {
      if (!isTop() || panel!.contains(event.target as Node)) return
      ;(focusables()[0] ?? panel!).focus()
    }

    document.addEventListener('keydown', onKey)
    document.addEventListener('focusin', onFocusIn)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('focusin', onFocusIn)
      document.body.style.overflow = previous
      openDialogs.splice(openDialogs.indexOf(panel), 1)
      const target = returnTo?.isConnected ? returnTo : inherited?.isConnected ? inherited : null
      if (target && focusWasInDialog(document.activeElement, root, document.body)) target.focus()
    }
  }, [returnTo, inherited])

  // Portal a <body>: el diálogo se abre desde una celda de tabla y no debe
  // heredar su alineación ni quedar dentro de su contexto de apilamiento.
  if (typeof document === 'undefined') return null

  return createPortal(
    <div ref={rootRef} className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 text-left">
      {/* El fondo no toma el foco al pulsarlo (mousedown): el foco sigue en
          el diálogo hasta que se cierra y entonces vuelve a quien lo abrió. */}
      <button
        type="button"
        tabIndex={-1}
        aria-label="Cerrar"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => !locked && onClose()}
        className="absolute inset-0 bg-gray-900/40"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={`relative focus:outline-none w-full ${size === 'lg' ? 'sm:max-w-4xl' : 'sm:max-w-xl'} max-h-[92vh] bg-white rounded-t-2xl sm:rounded-2xl ring-1 ring-gray-200/70 flex flex-col`}
      >
        <div className="flex items-start justify-between gap-4 px-5 sm:px-6 pt-5 pb-4 border-b border-gray-100">
          <div className="min-w-0">
            {eyebrow && <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{eyebrow}</p>}
            <h2 id={titleId} className="mt-1 text-base font-semibold text-gray-900">
              {title}
            </h2>
            {description && <p id={descriptionId} className="mt-1 text-sm text-gray-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={locked}
            className="h-9 w-9 shrink-0 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors flex items-center justify-center disabled:text-gray-300"
            aria-label="Cerrar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div ref={bodyRef} className="px-5 sm:px-6 py-4 overflow-y-auto">{children}</div>

        {footer && (
          <div className="px-5 sm:px-6 py-4 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

/** Botones del diálogo, con el mismo sistema que el resto del dashboard. */
export const dialogButton = {
  primary:
    'h-11 px-5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 active:scale-[0.98] shadow-sm shadow-blue-600/25 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 whitespace-nowrap',
  secondary:
    'h-11 px-5 rounded-xl bg-white text-gray-900 text-sm font-semibold ring-1 ring-inset ring-gray-200 hover:ring-gray-300 hover:bg-gray-50 active:scale-[0.98] transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 whitespace-nowrap',
  danger:
    'h-11 px-5 rounded-xl bg-white text-red-600 text-sm font-semibold ring-1 ring-inset ring-gray-200 hover:ring-red-300 hover:bg-red-50 active:scale-[0.98] transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 whitespace-nowrap',
}

export const fieldClass =
  'h-11 w-full rounded-xl px-4 text-sm text-gray-900 placeholder:text-gray-400 ring-1 ring-inset ring-gray-200 hover:ring-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400 transition-all duration-150'
export const labelClass = 'text-sm font-medium text-gray-900'
