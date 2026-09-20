'use client'

import { useEffect } from 'react'
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

/** Diálogo modal del dashboard: hoja inferior en móvil, ventana centrada en sm+. */
export function DialogShell({ title, eyebrow, description, onClose, locked = false, footer, children, size = 'lg' }: DialogShellProps) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !locked) onClose()
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [onClose, locked])

  // Portal a <body>: el diálogo se abre desde una celda de tabla y no debe
  // heredar su alineación ni quedar dentro de su contexto de apilamiento.
  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 text-left">
      <button type="button" aria-label="Cerrar" onClick={() => !locked && onClose()} className="absolute inset-0 bg-gray-900/40" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className={`relative w-full ${size === 'lg' ? 'sm:max-w-4xl' : 'sm:max-w-xl'} max-h-[92vh] bg-white rounded-t-2xl sm:rounded-2xl ring-1 ring-gray-200/70 flex flex-col`}
      >
        <div className="flex items-start justify-between gap-4 px-5 sm:px-6 pt-5 pb-4 border-b border-gray-100">
          <div className="min-w-0">
            {eyebrow && <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{eyebrow}</p>}
            <h2 id="dialog-title" className="mt-1 text-base font-semibold text-gray-900">
              {title}
            </h2>
            {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
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

        <div className="px-5 sm:px-6 py-4 overflow-y-auto">{children}</div>

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
