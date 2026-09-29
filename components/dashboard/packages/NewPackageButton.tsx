'use client'

import { useState } from 'react'
import { NewPackageDialog } from './NewPackageDialog'

/** Botón de la cabecera de /dashboard/paquetes. */
export function NewPackageButton({ durations }: { durations: number[] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-11 px-5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 active:scale-[0.98] shadow-sm shadow-blue-600/25 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 inline-flex items-center gap-2"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Sell package
      </button>
      {open && <NewPackageDialog durations={durations} onClose={() => setOpen(false)} />}
    </>
  )
}
