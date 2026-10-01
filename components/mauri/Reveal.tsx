'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Entrada de sección: aparece una vez al entrar en pantalla.
 *
 * El ocultado inicial vive en CSS (app/globals.css, `[data-reveal]`) y solo
 * aplica con `prefers-reduced-motion: no-preference`: con movimiento reducido
 * el contenido se pinta tal cual desde el servidor, sin animación ni parpadeo.
 */
export default function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setShown(true)
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true)
          observer.disconnect()
        }
      },
      { threshold: 0.12 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} data-reveal={shown ? 'shown' : 'pending'} className={className}>
      {children}
    </div>
  )
}
