# Trainer Booking Platform

A professional multi-trainer booking SaaS platform with embeddable reservation widget. Trainers can manage their availability, and clients can book sessions through an easy-to-use interface.

## Features

- **Multi-Trainer Support**: Multiple trainers with individual accounts and subscriptions
- **Embeddable Widget**: Drop-in reservation widget for trainer websites
- **Real-time Availability**: Manage class schedules and availability slots
- **Client Management**: Phone-based client identification and history
- **Admin Dashboard**: Manage trainers, availability, and reservations
- **Subscription Tiers**: Free, Starter, and Professional plans
- **Responsive Design**: Mobile-friendly interface with dark mode support

## Tech Stack

- **Frontend**: Next.js 16 with React 19
- **Backend**: Next.js API Routes
- **Database**: Supabase (PostgreSQL)
- **Styling**: Tailwind CSS 4
- **UI Components**: Custom shadcn-style components
- **Type Safety**: TypeScript
- **Deployment**: Vercel + Supabase

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Supabase account (free tier available)
- Vercel account (for deployment)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd trainer-booking-platform
```

2. Install dependencies:
```bash
npm install
```

3. Set up Supabase:
   - Follow the [Supabase Setup Guide](./SUPABASE_SETUP.md)
   - Copy `.env.example` to `.env.local`
   - Add your Supabase credentials

4. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
trainer-booking-platform/
├── app/
│   ├── api/                 # API routes
│   │   ├── coaches/        # List all trainers
│   │   ├── disponibilidad/ # Availability slots
│   │   └── reservas/       # Reservations
│   ├── layout.tsx          # Root layout
│   └── page.tsx            # Home page
├── components/
│   ├── ui/                 # Reusable UI components
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── calendar.tsx
│   │   └── ...
│   └── widgets/
│       └── ReservationWidget.tsx  # Main booking widget
├── lib/
│   ├── domain/
│   │   └── types.ts        # TypeScript types
│   ├── services/           # Database service layer
│   │   ├── trainers.service.ts
│   │   ├── clients.service.ts
│   │   ├── reservations.service.ts
│   │   └── availability.service.ts
│   ├── supabase/
│   │   └── client.ts       # Supabase client
│   └── utils/
│       └── use-reservations.ts  # Custom hooks
├── migrations/
│   └── 001_initial_schema.sql   # Database schema
├── public/                 # Static assets
└── README.md

```

## API Routes

### GET `/api/coaches`
List all active trainers.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "John Doe",
      "bio": "Professional padel coach",
      "image_url": "https://...",
      "email": "john@example.com"
    }
  ]
}
```

### GET `/api/disponibilidad`
Get available time slots for a trainer.

**Query Parameters:**
- `trainer_id` (required): Trainer UUID
- `date` (required): Date in YYYY-MM-DD format
- `class_type` (optional): 'individual', 'group', 'semi-private'

### POST `/api/reservas`
Create a new reservation.

**Request Body:**
```json
{
  "trainer_id": "uuid",
  "session_date": "2024-09-20",
  "session_time": "10:00",
  "class_type": "individual",
  "client_name": "María García",
  "client_phone": "+34621234567",
  "client_email": "maria@example.com"
}
```

### GET `/api/reservas`
Get reservations (with optional filters).

**Query Parameters:**
- `trainer_id` (optional)
- `client_id` (optional)
- `status` (optional): 'pending', 'confirmed', 'cancelled', 'completed'
- `date_from` (optional): YYYY-MM-DD
- `date_to` (optional): YYYY-MM-DD

## Usage: ReservationWidget

Embed the booking widget in any website:

```tsx
import { ReservationWidget } from '@/components/widgets/ReservationWidget'

export default function Page() {
  return (
    <div>
      <ReservationWidget 
        trainerId="optional-trainer-id"
        daysAhead={30}
        classTypes={['individual', 'group']}
      />
    </div>
  )
}
```

## Database Schema

See [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) for detailed schema documentation.

Key tables:
- `trainers` - Trainer profiles and subscription info
- `clients` - Client information (phone-based)
- `availability_slots` - Available time slots
- `reservations` - Booking records

## Development

### Type Checking
```bash
npm run type-check
```

### Linting
```bash
npm run lint
```

### Format Code
```bash
npm run format
```

### Build
```bash
npm run build
npm start
```

## Environment Variables

See `.env.example` for all available options. Key variables:

- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role (server only)

## Deployment

### Deploy to Vercel

1. Push code to GitHub
2. Connect repository to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

```bash
vercel --prod
```

### Production Checklist

- [ ] Set up authentication (Clerk, Auth0, or Supabase Auth)
- [ ] Configure RLS policies for data isolation
- [ ] Set up payment processing (Stripe, etc.)
- [ ] Enable HTTPS (automatic with Vercel)
- [ ] Set up monitoring and error tracking
- [ ] Configure custom domain
- [ ] Set up email notifications

## Contributing

This is a personal project. Contributions welcome but please discuss major changes first.

## License

MIT

## Support

For issues and questions:
1. Check [DEVELOPMENT.md](./DEVELOPMENT.md) for architecture details
2. Check [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) for database help
3. Review code comments and type definitions

## Roadmap

- [ ] Phase 1: Core booking system ✅
- [ ] Phase 2: UI components ✅
- [ ] Phase 3: Supabase integration 🔄
- [ ] Phase 4: Web portal
- [ ] Phase 5: Admin dashboard
- [ ] Phase 6: Authentication
- [ ] Phase 7: Payments & subscriptions
- [ ] Phase 8: Email notifications
- [ ] Phase 9: Analytics
- [ ] Phase 10: Production deployment
