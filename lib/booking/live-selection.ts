/**
 * Selección de reserva en curso, compartida entre componentes hermanos de la
 * misma página (la cabecera de /mauri necesita saber qué horas hay elegidas
 * para que "Entrar" no las pierda).
 *
 * Solo memoria de la pestaña: no persiste ni viaja a ningún sitio. La única
 * fuente de verdad de la selección sigue siendo BookingFlow, que la publica
 * aquí con `onLiveSelection`.
 */

export interface LiveSelection {
  sessions: Array<{ date: string; time: string }>
  duration: number
  playerCount: number
}

const EMPTY: LiveSelection = { sessions: [], duration: 60, playerCount: 1 }

let current: LiveSelection = EMPTY
const listeners = new Set<() => void>()

export function publishLiveSelection(selection: LiveSelection): void {
  current = selection
  listeners.forEach((listener) => listener())
}

export function getLiveSelection(): LiveSelection {
  return current
}

export function getEmptyLiveSelection(): LiveSelection {
  return EMPTY
}

export function subscribeLiveSelection(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
