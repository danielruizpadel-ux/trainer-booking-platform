'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { alert, surface, text } from '@/components/ui/styles'

export default function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      // TODO: Implement admin authentication (CLAUDE.md: bloqueante antes de publicar).
      // Nunca registrar el email ni la contraseña, tampoco en consola.
    } catch (err) {
      setError('Authentication failed')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50/50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className={`${surface.card} p-6 sm:p-8`}>
          <p className={text.eyebrow}>Admin</p>
          <h1 className={`mt-1.5 ${text.pageTitle}`}>Admin Login</h1>

          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="admin-email">Email</Label>
              <Input
                id="admin-email"
                type="email"
                autoComplete="username"
                placeholder="admin@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="admin-password">Password</Label>
              <Input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <div className={alert.error} role="alert">
                {error}
              </div>
            )}

            <Button type="submit" disabled={isLoading} className="w-full">
              {isLoading ? 'Logging in...' : 'Login'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            Demo credentials: admin@example.com / password
          </p>
        </div>
      </div>
    </div>
  )
}
