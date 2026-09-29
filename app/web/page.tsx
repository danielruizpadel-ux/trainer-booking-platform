/**
 * Web portal home page
 */

import Link from 'next/link'
import { Icon } from '@/components/ui/icon'
import { button, surface, text } from '@/components/ui/styles'
import { createSessionClient } from '@/lib/supabase/server'

const FEATURES = ['Professional trainers', 'Flexible scheduling', 'Coach-reviewed bookings', 'Secure bookings']

const STEPS = [
  { title: 'Browse Trainers', body: 'Explore our network of certified fitness trainers with various specializations.' },
  { title: 'Select Time', body: 'Check availability and pick a time that works best for your schedule.' },
  { title: 'Request your booking', body: 'Complete your booking and your coach will confirm once the court is booked.' },
]

export default async function WebHome() {
  const session = await createSessionClient()
  const { data: { user } } = await session.auth.getUser()
  return (
    <div className="min-h-screen bg-gray-50/50 flex flex-col">
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <Link
            href="/web"
            className="flex items-center gap-2.5 min-w-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <span className="h-8 w-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
              <Icon name="calendar" size={16} />
            </span>
            <span className="text-sm font-semibold text-gray-900 truncate">Trainer Booking Platform</span>
          </Link>
          <nav aria-label="Account" className="flex items-center gap-2">
            {user ? (
              <Link href="/cuenta" className={button.ghost}>My account</Link>
            ) : (
              <>
                <Link href="/cuenta/entrar" className={button.ghost}>Log in</Link>
                <Link href="/cuenta/entrar" className={button.primary}>Sign up</Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 flex flex-col gap-16">
        <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-8 lg:gap-12 items-start">
          <div>
            <p className={text.eyebrow}>Book your perfect training session</p>
            <h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-gray-900">Welcome</h1>
            <p className="mt-3 text-lg text-gray-500 max-w-xl">
              Find and book sessions with professional fitness trainers in your area. Choose from a variety of training
              styles and experience levels.
            </p>
            <ul className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {FEATURES.map((feature) => (
                <li key={feature} className="flex items-center gap-2.5 text-sm text-gray-700">
                  <Icon name="check" size={16} className="text-blue-600 shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          <aside className={`${surface.card} p-6`}>
            <h2 className={text.cardTitle}>Get Started</h2>
            <p className="mt-1.5 text-sm text-gray-600">Browse our trainers and book your first session today.</p>
            <Link href="/trainers" className={`mt-6 w-full ${button.primary}`}>
              Browse Trainers
              <Icon name="arrow-right" size={18} />
            </Link>
          </aside>
        </section>

        <section aria-labelledby="how-title">
          <h2 id="how-title" className={text.sectionTitle}>
            How It Works
          </h2>
          <ol className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
            {STEPS.map((step, i) => (
              <li key={step.title} className={`${surface.card} p-6`}>
                <span className={`${surface.iconTile} text-sm font-bold tabular-nums`}>{i + 1}</span>
                <h3 className={`mt-4 ${text.cardTitle}`}>{step.title}</h3>
                <p className="mt-1.5 text-sm text-gray-600">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="bg-white border-t border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <h2 className={text.eyebrow}>About</h2>
              <p className="mt-3 text-sm text-gray-600">
                Connect with professional fitness trainers and achieve your health goals.
              </p>
            </div>
            <div>
              <h2 className={text.eyebrow}>Quick Links</h2>
              <ul className="mt-3 flex flex-col gap-2">
                <li>
                  <Link href="/trainers" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                    Browse Trainers
                  </Link>
                </li>
                <li>
                  <Link href="/admin/login" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                    Admin Portal
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h2 className={text.eyebrow}>Contact</h2>
              <p className="mt-3 flex items-center gap-2 text-sm text-gray-600">
                <Icon name="mail" size={16} className="text-gray-400" />
                support@trainerbooking.com
              </p>
            </div>
          </div>
          <p className="mt-10 pt-6 border-t border-gray-100 text-xs text-gray-400">
            &copy; 2024 Trainer Booking Platform. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
