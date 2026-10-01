/**
 * Enlace a la cuenta de jugador que NO pierde la selección de horas.
 *
 * Mismo mecanismo que el checkout ("Continue with my account"): si hay horas
 * elegidas, guarda un borrador NO sensible (lib/booking/draft.ts) y añade
 * `&draft=<uuid>`; /cuenta/entrar, el callback y la bienvenida ya transportan
 * ese parámetro y devuelven a `/<slug>?draft=…#booking-section`
 * (lib/players/entry.ts). No cambia nada de la autenticación.
 *
 * Sin selección (o sin almacenamiento disponible) devuelve el enlace normal:
 * no hay nada que perder, y la entrada sigue funcionando.
 */

import { createDraft, saveDraft, type DraftStorage } from './draft'

export type AccountEntryPath = '/cuenta/entrar' | '/cuenta/bienvenida'

export interface AccountEntrySelection {
  sessions: Array<{ date: string; time: string }>
  duration: number
  playerCount: number
}

export function plainAccountEntryUrl(path: AccountEntryPath, trainerSlug: string): string {
  return `${path}?${new URLSearchParams({ trainer: trainerSlug }).toString()}`
}

export function accountEntryUrl(
  path: AccountEntryPath,
  trainerSlug: string,
  selection: AccountEntrySelection,
  deps: { storage: DraftStorage | null; newId: (() => string) | null; now: number }
): string {
  const params = new URLSearchParams({ trainer: trainerSlug })
  if (selection.sessions.length > 0 && deps.storage && deps.newId) {
    const draft = createDraft(
      {
        draftId: deps.newId(),
        trainerSlug,
        sessions: selection.sessions.map((s) => ({ date: s.date, time: s.time.slice(0, 5) })),
        duration: selection.duration,
        playerCount: selection.playerCount,
      },
      deps.now
    )
    if (saveDraft(deps.storage, draft, deps.now)) params.set('draft', draft.draftId)
  }
  return `${path}?${params.toString()}`
}
