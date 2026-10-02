'use client'

import { useEffect, useState, useSyncExternalStore, type MouseEvent } from 'react'
import { browserDraftStorage } from '@/lib/booking/draft'
import { accountEntryUrl, plainAccountEntryUrl, type AccountEntryPath } from '@/lib/booking/account-entry'
import { getEmptyLiveSelection, getLiveSelection, subscribeLiveSelection } from '@/lib/booking/live-selection'

interface MauriHeaderProps {
  trainerSlug: string
}

type HeaderAccount =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'player'; name: string }
  | { status: 'incomplete' }
  /** No se pudo comprobar: se ofrece entrar igualmente. */
  | { status: 'error' }

/**
 * Cabecera fija de /mauri (B v2): marca, secciones, acceso a la cuenta y
 * "Reservar".
 *
 * "Entrar" y "Completar perfil" NO pierden la selección: si hay horas
 * elegidas, guardan el mismo borrador no sensible que el checkout y van a
 * /cuenta/... con `&draft=` (lib/booking/account-entry.ts). Al volver, la
 * página restaura las horas que sigan libres. No cambia la autenticación.
 */
export default function MauriHeader({ trainerSlug }: MauriHeaderProps) {
  const [account, setAccount] = useState<HeaderAccount>({ status: 'loading' })
  const selection = useSyncExternalStore(subscribeLiveSelection, getLiveSelection, getEmptyLiveSelection)
  const chosen = selection.sessions.length

  useEffect(() => {
    let cancelled = false
    fetch('/api/player/me', { cache: 'no-store' })
      .then(async (r) => {
        const data = await r.json().catch(() => null)
        if (!r.ok || !data) throw new Error('me')
        return data as { authenticated?: boolean; player?: { full_name?: string } | null }
      })
      .then((data) => {
        if (cancelled) return
        if (!data.authenticated) setAccount({ status: 'anonymous' })
        else if (data.player?.full_name) setAccount({ status: 'player', name: data.player.full_name })
        else setAccount({ status: 'incomplete' })
      })
      .catch(() => {
        if (!cancelled) setAccount({ status: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const goToAccount = (path: AccountEntryPath) => (event: MouseEvent<HTMLAnchorElement>) => {
    // Clic normal: guarda la selección y navega. Con modificadores (nueva
    // pestaña) se deja el enlace tal cual.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
    event.preventDefault()
    const newId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? () => crypto.randomUUID() : null
    window.location.assign(
      accountEntryUrl(path, trainerSlug, getLiveSelection(), { storage: browserDraftStorage(), newId, now: Date.now() })
    )
  }

  const keepNote = chosen > 0 ? ` (se conserva${chosen === 1 ? ' la hora elegida' : `n las ${chosen} horas elegidas`})` : ''
  const pill =
    'inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold ring-1 ring-inset ring-mauri-graphite-line transition-colors hover:ring-mauri-muted-d focus:outline-none focus-visible:ring-2 focus-visible:ring-mauri-teal-light sm:px-3.5'

  return (
    <header className="sticky top-0 z-30 border-b border-mauri-graphite-line bg-mauri-graphite/95 text-mauri-paper backdrop-blur">
      <div className="mx-auto flex h-[58px] max-w-6xl items-center gap-2 px-4 sm:h-16 sm:gap-6 sm:px-6 lg:px-8">
        <a
          href="#"
          className="mr-auto flex items-center gap-2.5 whitespace-nowrap font-mauri-display text-base font-bold uppercase tracking-[0.07em] focus:outline-none focus-visible:ring-2 focus-visible:ring-mauri-teal-light sm:text-[19px]"
        >
          <span aria-hidden className="h-2 w-2 rotate-45 bg-mauri-teal-light" />
          The Padel Doctor
        </a>
        <nav aria-label="Secciones" className="hidden items-center gap-6 text-sm text-mauri-muted-d md:flex">
          <a href="#reserva" className="hover:text-mauri-paper focus:outline-none focus-visible:text-mauri-paper">
            Agenda
          </a>
          <a href="#oferta" className="hover:text-mauri-paper focus:outline-none focus-visible:text-mauri-paper">
            Clases y precios
          </a>
        </nav>

        <div className={account.status === 'loading' ? 'invisible' : undefined} aria-busy={account.status === 'loading'}>
          {account.status === 'player' ? (
            <a href="/cuenta" className="inline-flex h-10 items-center gap-2.5 rounded-full pl-1 pr-1 ring-1 ring-inset ring-mauri-graphite-line hover:ring-mauri-muted-d focus:outline-none focus-visible:ring-2 focus-visible:ring-mauri-teal-light sm:pr-3">
              <span aria-hidden className="grid h-8 w-8 place-items-center rounded-full bg-mauri-teal font-mauri-display text-sm font-bold">
                {account.name.trim().charAt(0).toUpperCase()}
              </span>
              <span className="hidden leading-tight sm:block">
                <span className="block text-[11px] text-mauri-muted-d">Tu cuenta</span>
                <span className="block max-w-[10rem] truncate text-sm font-semibold">{account.name.split(' ')[0]}</span>
              </span>
              <span className="sr-only sm:hidden">Tu cuenta</span>
            </a>
          ) : account.status === 'incomplete' ? (
            <a href={plainAccountEntryUrl('/cuenta/bienvenida', trainerSlug)} onClick={goToAccount('/cuenta/bienvenida')} className={pill}>
              <span className="hidden sm:inline">Completar perfil</span>
              <span className="sm:hidden">Perfil</span>
              <span className="sr-only">{keepNote}</span>
            </a>
          ) : (
            <a href={plainAccountEntryUrl('/cuenta/entrar', trainerSlug)} onClick={goToAccount('/cuenta/entrar')} className={pill}>
              <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
              </svg>
              <span className="hidden sm:inline">Entrar / Crear cuenta</span>
              <span className="sm:hidden">Entrar</span>
              <span className="sr-only">{keepNote}</span>
            </a>
          )}
        </div>

        <a
          href="#reserva"
          className="inline-flex h-10 items-center rounded-md bg-mauri-paper px-3 font-mauri-display text-sm font-bold uppercase tracking-[0.09em] text-mauri-graphite transition-colors hover:bg-white active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-mauri-teal-light sm:px-5"
        >
          Reservar
        </a>
      </div>
    </header>
  )
}
