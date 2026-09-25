'use client'

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface ActionsMenuItem {
  label: string
  onSelect: () => void
  disabled?: boolean
}

interface ActionsMenuProps {
  label: string
  items: ActionsMenuItem[]
  /** Clases del botón que abre el menú (mismo alto que los botones de la fila). */
  buttonClassName: string
}

/**
 * Menú de acciones secundarias de una fila.
 *
 * Se pinta en un portal con `position: fixed`, así ningún contenedor con
 * overflow (la tabla tiene overflow-x-auto + overflow-hidden) lo recorta; si
 * no cabe debajo del botón, se abre hacia arriba. Se cierra al elegir una
 * opción (antes de que esta abra su diálogo), al hacer clic fuera, con Escape
 * (devolviendo el foco al botón), al hacer scroll o al cambiar el tamaño.
 * Teclado: flechas, Inicio/Fin y Tab (Tab cierra, como un menú nativo).
 */
export function ActionsMenu({ label, items, buttonClassName }: ActionsMenuProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  const close = useCallback((returnFocus = false) => {
    setOpen(false)
    setPos(null)
    if (returnFocus) buttonRef.current?.focus()
  }, [])

  // Posición: alineado a la derecha del botón, debajo; arriba si no cabe.
  useLayoutEffect(() => {
    if (!open) return
    const button = buttonRef.current
    const menu = menuRef.current
    if (!button || !menu) return
    const b = button.getBoundingClientRect()
    const margin = 8
    const width = menu.offsetWidth
    const height = menu.offsetHeight
    const left = Math.min(Math.max(margin, b.right - width), window.innerWidth - margin - width)
    const below = b.bottom + 6
    const top = below + height > window.innerHeight - margin ? Math.max(margin, b.top - 6 - height) : below
    setPos({ top, left })
    menu.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node
      if (menuRef.current?.contains(t) || buttonRef.current?.contains(t)) return
      close()
    }
    const onScrollOrResize = () => close()
    document.addEventListener('mousedown', onPointer)
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [open, close])

  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const menuItems = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])]
    const i = menuItems.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'Escape') {
      e.preventDefault()
      close(true)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      menuItems[(i + 1) % menuItems.length]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      menuItems[(i - 1 + menuItems.length) % menuItems.length]?.focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      menuItems[0]?.focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      menuItems[menuItems.length - 1]?.focus()
    } else if (e.key === 'Tab') {
      close()
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close() : setOpen(true))}
        className={buttonClassName}
      >
        {label}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label}
            onKeyDown={onMenuKeyDown}
            style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
            className="z-50 min-w-[13rem] rounded-xl bg-white p-1.5 ring-1 ring-gray-200"
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  // Cerrar ANTES de la acción: si abre un diálogo, el menú ya no está.
                  close()
                  item.onSelect()
                }}
                className="w-full rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:bg-gray-50 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:text-gray-400 disabled:cursor-not-allowed"
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  )
}
