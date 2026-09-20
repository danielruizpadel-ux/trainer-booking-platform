'use client'

import Link from 'next/link'

interface FooterSectionProps {
  email?: string
  phone?: string
  whatsapp?: string
  instagram?: string
}

const iconProps = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const MailIcon = () => (
  <svg {...iconProps}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3.5 6.5l8.5 6 8.5-6" />
  </svg>
)

const PhoneIcon = () => (
  <svg {...iconProps}>
    <path d="M6.5 3h3l1.5 4-2 1.5a12 12 0 0 0 5.5 5.5l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.2 2 2 0 0 1 6.5 3z" />
  </svg>
)

const MessageIcon = () => (
  <svg {...iconProps}>
    <path d="M20.5 11.5a7.5 7.5 0 0 1-10.9 6.7L4.5 19.5l1.3-4.8A7.5 7.5 0 1 1 20.5 11.5z" />
  </svg>
)

const CameraIcon = () => (
  <svg {...iconProps}>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
  </svg>
)

const linkClass =
  'flex items-center gap-2.5 text-sm text-gray-600 hover:text-gray-900 transition-colors'
const headingClass = 'text-xs font-semibold uppercase tracking-wider text-gray-400'

export default function FooterSection({
  email = 'mauri@padeldoctor.com',
  phone = '+1234567890',
  whatsapp = '1234567890',
  instagram = '@mauridoctor',
}: FooterSectionProps) {
  return (
    <footer className="bg-gray-100 border-t border-gray-200/70 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {/* Marca */}
          <div>
            <p className="text-base font-semibold text-gray-900">The Padel Doctor</p>
            <p className="mt-2 text-sm text-gray-600">
              Técnica clínica · Estrategia · Mentalidad ganadora
            </p>
          </div>

          {/* Contacto */}
          <div>
            <h3 className={headingClass}>Contacto</h3>
            <div className="mt-4 space-y-3">
              <a href={`mailto:${email}`} className={linkClass}>
                <span className="text-gray-400">
                  <MailIcon />
                </span>
                {email}
              </a>
              <a href={`tel:${phone}`} className={linkClass}>
                <span className="text-gray-400">
                  <PhoneIcon />
                </span>
                {phone}
              </a>
              <a
                href={`https://wa.me/${whatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
                className={linkClass}
              >
                <span className="text-gray-400">
                  <MessageIcon />
                </span>
                WhatsApp
              </a>
              <a
                href={`https://instagram.com/${instagram.replace('@', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className={linkClass}
              >
                <span className="text-gray-400">
                  <CameraIcon />
                </span>
                Instagram
              </a>
            </div>
          </div>

          {/* Enlaces */}
          <div>
            <h3 className={headingClass}>Enlaces</h3>
            <div className="mt-4 space-y-3">
              <Link href="/trainers" className={linkClass}>
                Ver otros trainers
              </Link>
              <Link href="/" className={linkClass}>
                Inicio
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-gray-100">
          <p className="text-xs text-gray-400">
            © 2026 Mauricio Martin — The Padel Doctor. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </footer>
  )
}
