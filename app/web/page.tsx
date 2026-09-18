/**
 * Web portal home page
 */

import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function WebHome() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-foreground">Trainer Booking Platform</h1>
              <p className="text-sm text-muted-foreground mt-1">Book your perfect training session</p>
            </div>
            <div className="flex gap-4">
              <Link href="/admin/login">
                <Button variant="outline">Admin Login</Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          {/* Welcome section */}
          <div>
            <h2 className="text-2xl font-bold text-foreground mb-4">Welcome</h2>
            <p className="text-muted-foreground mb-4">
              Find and book sessions with professional fitness trainers in your area. Choose from a variety of training styles and experience levels.
            </p>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">✓ Professional trainers</p>
              <p className="text-sm text-muted-foreground">✓ Flexible scheduling</p>
              <p className="text-sm text-muted-foreground">✓ Instant confirmation</p>
              <p className="text-sm text-muted-foreground">✓ Secure bookings</p>
            </div>
          </div>

          {/* CTA section */}
          <div className="bg-card rounded-lg border border-border p-8">
            <h3 className="text-xl font-bold text-foreground mb-4">Get Started</h3>
            <p className="text-muted-foreground mb-6">
              Browse our trainers and book your first session today.
            </p>
            <Link href="/trainers" className="block">
              <Button className="w-full">Browse Trainers</Button>
            </Link>
          </div>
        </div>

        {/* Features section */}
        <div className="mt-16">
          <h2 className="text-2xl font-bold text-foreground mb-8">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-card rounded-lg border border-border p-6">
              <div className="w-12 h-12 bg-primary text-primary-foreground rounded-lg flex items-center justify-center font-bold mb-4">
                1
              </div>
              <h4 className="font-semibold text-foreground mb-2">Browse Trainers</h4>
              <p className="text-sm text-muted-foreground">
                Explore our network of certified fitness trainers with various specializations.
              </p>
            </div>

            <div className="bg-card rounded-lg border border-border p-6">
              <div className="w-12 h-12 bg-primary text-primary-foreground rounded-lg flex items-center justify-center font-bold mb-4">
                2
              </div>
              <h4 className="font-semibold text-foreground mb-2">Select Time</h4>
              <p className="text-sm text-muted-foreground">
                Check availability and pick a time that works best for your schedule.
              </p>
            </div>

            <div className="bg-card rounded-lg border border-border p-6">
              <div className="w-12 h-12 bg-primary text-primary-foreground rounded-lg flex items-center justify-center font-bold mb-4">
                3
              </div>
              <h4 className="font-semibold text-foreground mb-2">Confirm Booking</h4>
              <p className="text-sm text-muted-foreground">
                Complete your booking and receive instant confirmation via email.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card mt-16">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            <div>
              <h4 className="font-semibold text-foreground mb-4">About</h4>
              <p className="text-sm text-muted-foreground">
                Connect with professional fitness trainers and achieve your health goals.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-4">Quick Links</h4>
              <ul className="space-y-2">
                <li><Link href="/trainers" className="text-sm text-muted-foreground hover:text-foreground">Browse Trainers</Link></li>
                <li><Link href="/admin/login" className="text-sm text-muted-foreground hover:text-foreground">Admin Portal</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-4">Contact</h4>
              <p className="text-sm text-muted-foreground">support@trainerbooking.com</p>
            </div>
          </div>
          <div className="border-t border-border pt-8 text-center text-sm text-muted-foreground">
            <p>&copy; 2024 Trainer Booking Platform. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
