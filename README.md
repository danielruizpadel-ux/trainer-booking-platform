# Trainer Booking Platform

A modern, multi-trainer booking platform with embedded reservation widgets. Built with Next.js 16, React 19, and Supabase.

## Features

- 🎯 Multi-trainer support (SaaS model)
- 📅 Reservation management system
- 🎨 Embeddable reservation widget
- 🔐 Admin dashboard with authentication
- 📱 Fully responsive design
- 🚀 Production-ready code

## Tech Stack

- **Frontend:** Next.js 16, React 19, Tailwind CSS 4
- **Database:** Supabase (PostgreSQL)
- **Authentication:** JWT-based admin auth
- **Deployment:** Vercel

## Getting Started

### Prerequisites

- Node.js 18+ and npm/pnpm
- Supabase account and project

### Installation

1. Clone the repository
2. Copy `.env.example` to `.env.local` and fill in your Supabase credentials
3. Install dependencies: `pnpm install`
4. Run development server: `pnpm dev`

## Project Structure

```
trainer-booking-platform/
├── app/                 # Next.js app directory
│   ├── api/            # API routes
│   ├── admin/          # Admin dashboard
│   ├── web/            # Trainer web portal
│   └── layout.tsx      # Root layout
├── components/         # React components
│   ├── ui/            # UI components (buttons, forms, etc.)
│   ├── widgets/       # Reservation widget
│   └── forms/         # Form components
├── lib/               # Utilities and services
│   ├── services/      # Business logic
│   ├── supabase/      # Supabase configuration
│   ├── domain/        # Domain types
│   └── utils/         # Helper functions
└── public/            # Static assets
```

## Development

- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm type-check` - Run TypeScript type checking
- `pnpm format` - Format code with Prettier

## Contributing

This project is managed by the development team. Code should be:
- Written in English with clear comments
- Type-safe (TypeScript)
- Well-structured and modular
- Ready for handoff to external teams

## License

Proprietary - All rights reserved
