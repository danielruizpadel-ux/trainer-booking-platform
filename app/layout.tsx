/**
 * Root layout component
 * Provides global structure and metadata for the application
 */

import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Trainer Booking Platform',
  description: 'Professional booking system for fitness trainers',
  viewport: 'width=device-width, initial-scale=1',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      {/* Extensiones del navegador (gestores de contraseñas, temas...) inyectan
          atributos en <body> antes de hidratar y React lo reporta como
          "hydration mismatch". No es nuestro: se silencia solo en este nodo. */}
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
