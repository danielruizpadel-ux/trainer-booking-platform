'use client'

import React from 'react'

interface CalendarLayoutProps {
  navbar: React.ReactNode
  children: React.ReactNode
}

export default function CalendarLayout({ navbar, children }: CalendarLayoutProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      {/* Navbar */}
      {navbar}

      {/* Main Content */}
      <main className="py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
