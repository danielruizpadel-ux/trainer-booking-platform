'use client'

import { useState } from 'react'

interface FocusEditorProps {
  initialFocus: string
  sessionNumber: number
}

/** Foco de la próxima sesión, editable por cualquiera de los entrenadores del plan. Prototipo: no guarda. */
export function FocusEditor({ initialFocus, sessionNumber }: FocusEditorProps) {
  const [focus, setFocus] = useState(initialFocus)
  // Último valor "guardado": tras guardar, el botón se apaga hasta el siguiente cambio.
  const [savedFocus, setSavedFocus] = useState(initialFocus)
  const [saved, setSaved] = useState(false)
  const dirty = focus.trim() !== savedFocus.trim() && focus.trim() !== ''

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!dirty) return
        setSavedFocus(focus)
        setSaved(true)
      }}
    >
      <label htmlFor="next-focus" className="text-xs font-semibold uppercase tracking-wider text-gray-400">
        Foco de la sesión {sessionNumber}
      </label>
      <textarea
        id="next-focus"
        rows={3}
        value={focus}
        onChange={(e) => {
          setFocus(e.target.value)
          setSaved(false)
        }}
        className="mt-2 w-full rounded-xl px-3 py-2.5 text-sm text-gray-900 ring-1 ring-inset ring-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!dirty}
          className="h-9 px-4 rounded-lg text-sm font-semibold ring-1 ring-inset ring-gray-200 text-gray-900 hover:ring-gray-300 hover:bg-gray-50 transition-all duration-150 disabled:bg-gray-100 disabled:text-gray-400 disabled:ring-0 disabled:cursor-not-allowed"
        >
          {saved && !dirty ? 'Foco guardado' : 'Guardar foco'}
        </button>
        {saved && (
          <p role="status" className="text-xs text-gray-500">
            Prototipo: no se guarda. En la versión real lo verá también el otro entrenador.
          </p>
        )}
      </div>
    </form>
  )
}
