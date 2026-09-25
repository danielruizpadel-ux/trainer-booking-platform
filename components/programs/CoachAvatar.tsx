import type { Coach } from '@/lib/programs/types'

const SIZES = {
  sm: 'h-7 w-7 text-[11px]',
  md: 'h-10 w-10 text-sm',
} as const

/** Iniciales del entrenador; sin fotos hasta que existan en el perfil. */
export function CoachAvatar({ coach, size = 'md' }: { coach: Coach; size?: keyof typeof SIZES }) {
  return (
    <span
      aria-hidden
      className={`${SIZES[size]} rounded-full font-semibold flex items-center justify-center shrink-0 ${
        coach.id === 'dani' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-700'
      }`}
    >
      {coach.initials}
    </span>
  )
}
