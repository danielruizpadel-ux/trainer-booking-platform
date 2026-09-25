/**
 * Clases del sistema de diseño (DESIGN_SYSTEM.md), en un solo sitio.
 *
 * Salen del calendario de reservas, que es la referencia canónica, y son las
 * mismas que ya usan el dashboard (`components/dashboard/DialogShell`), la
 * cuenta (`components/player/*`) y el prototipo de /programa. Las usan los
 * primitivos de `components/ui/*` y las pantallas que se alinean con ese
 * sistema, para no repetir cadenas de clases pantalla por pantalla.
 *
 * Solo apariencia: nada de lógica ni de datos aquí.
 */

const focusRing =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2'

const buttonBase = `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-all duration-150 active:scale-[0.98] ${focusRing} disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none disabled:ring-0 disabled:cursor-not-allowed disabled:active:scale-100`

export const button = {
  /** El único azul sólido de la pantalla: la acción principal. */
  primary: `${buttonBase} h-12 px-6 bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-600/25`,
  secondary: `${buttonBase} h-12 px-6 bg-white text-gray-900 ring-1 ring-inset ring-gray-200 hover:ring-gray-300 hover:bg-gray-50`,
  /** Mismos botones en tamaño compacto (tablas, diálogos, cabeceras). */
  primarySm: `${buttonBase} h-10 px-4 text-sm bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-600/25`,
  secondarySm: `${buttonBase} h-10 px-4 text-sm bg-white text-gray-900 ring-1 ring-inset ring-gray-200 hover:ring-gray-300 hover:bg-gray-50`,
  ghost: `inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors ${focusRing}`,
  danger: `${buttonBase} h-12 px-6 bg-white text-red-600 ring-1 ring-inset ring-gray-200 hover:ring-red-300 hover:bg-red-50`,
  /** Enlace de texto dentro de un párrafo. */
  link: 'font-medium text-blue-600 hover:text-blue-700 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded',
}

export const field = {
  input:
    'h-12 w-full rounded-xl bg-white px-4 text-gray-900 placeholder:text-gray-400 ring-1 ring-inset ring-gray-200 hover:ring-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-all duration-150',
  /** Añadir al input cuando el campo tiene error (junto a aria-invalid). */
  invalid: 'ring-red-300 hover:ring-red-400 focus:ring-red-500',
  label: 'text-sm font-medium text-gray-900',
  hint: 'text-xs text-gray-500',
  error: 'text-sm text-red-600',
  checkbox: 'h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500',
  /** Casilla con su texto en una fila clicable (WhatsApp, opt-ins). */
  checkRow:
    'flex items-start gap-3 rounded-xl px-4 py-3 ring-1 ring-inset ring-gray-200 hover:ring-blue-400 hover:bg-blue-50/40 cursor-pointer transition-all duration-150',
}

export const surface = {
  card: 'bg-white rounded-2xl ring-1 ring-gray-200/70',
  cardInteractive: 'bg-white rounded-2xl ring-1 ring-gray-200/70 hover:ring-gray-300 transition-all duration-150',
  /** Bloque resaltado dentro de una tarjeta (resumen, fecha elegida). */
  tint: 'rounded-xl bg-blue-50',
  muted: 'rounded-xl bg-gray-50',
  divider: 'border-t border-gray-100',
  iconTile: 'h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0',
}

export const text = {
  eyebrow: 'text-xs font-semibold uppercase tracking-wider text-gray-400',
  pageTitle: 'text-2xl sm:text-3xl font-bold tracking-tight text-gray-900',
  sectionTitle: 'text-2xl sm:text-3xl font-bold tracking-tight text-gray-900',
  subtitle: 'text-gray-500',
  cardTitle: 'text-base font-semibold text-gray-900',
  body: 'text-sm text-gray-600',
}

export const alert = {
  error: 'rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-200',
  success: 'rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-inset ring-emerald-200',
  info: 'rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800',
}

export const layout = {
  section: 'py-16 sm:py-20 px-4 sm:px-6 lg:px-8',
  container: 'max-w-6xl mx-auto',
}
