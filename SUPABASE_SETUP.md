# Supabase Configuration Guide

This guide explains how to set up Supabase for the Trainer Booking Platform.

## Prerequisites

- A Supabase account (https://supabase.com)
- A new Supabase project created

## Setup Steps

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Sign in or create an account
3. Click "New project"
4. Fill in project details:
   - Name: `trainer-booking-platform` (or your preference)
   - Database password: Generate a strong password
   - Region: Choose the region closest to your users
5. Click "Create new project" and wait for initialization

### 2. Get Your API Keys

1. Go to your project dashboard
2. Click "Settings" in the left sidebar
3. Click "API" in the submenu
4. Copy the following values:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role secret` key → `SUPABASE_SERVICE_ROLE_KEY` (keep this secret!)

### 3. Create Environment Variables

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Fill in the values from step 2:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
   ```

### 4. Run Database Migrations

#### Option A: Using Supabase Dashboard (Recommended for quick setup)

1. Go to your Supabase project dashboard
2. Click "SQL Editor" in the left sidebar
3. Click "New Query"
4. Copy the entire content of `migrations/001_initial_schema.sql`
5. Paste it into the SQL editor
6. Click "Run" to execute the migration

#### Option B: Using Supabase CLI

```bash
# Install Supabase CLI if you haven't
npm install -g supabase

# Link your project
supabase link --project-ref your-project-ref

# Run migrations
supabase migration up
```

### 5. Verify the Schema

After running the migration, verify that all tables were created:

1. Go to "Table Editor" in your Supabase dashboard
2. You should see:
   - `trainers`
   - `clients`
   - `availability_slots`
   - `reservations`

## Database Schema Overview

### Trainers Table
Stores trainer information and subscription details.

```sql
- id (UUID, PK)
- name (TEXT)
- bio (TEXT, nullable)
- image_url (TEXT, nullable)
- email (TEXT, unique)
- phone (TEXT)
- status (active|inactive|archived)
- subscription_tier (free|starter|professional)
- subscription_status (active|inactive|cancelled)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

### Clients Table
Stores client information with phone-based identification.

```sql
- id (UUID, PK)
- phone (TEXT, unique) - Primary identifier
- name (TEXT, nullable)
- email (TEXT, nullable)
- total_reservations (INT)
- last_reservation_at (TIMESTAMP)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

### Availability Slots Table
Stores available time slots for trainers.

```sql
- id (UUID, PK)
- trainer_id (UUID, FK → trainers)
- session_date (DATE)
- start_time (TIME)
- end_time (TIME)
- class_type (individual|group|semi-private)
- max_capacity (INT)
- current_bookings (INT)
- status (available|full|cancelled)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

### Reservations Table
Stores booking data.

```sql
- id (UUID, PK)
- trainer_id (UUID, FK → trainers)
- client_id (UUID, FK → clients)
- availability_slot_id (UUID, FK → availability_slots, nullable)
- session_date (DATE)
- session_time (TIME)
- class_type (individual|group|semi-private)
- status (pending|confirmed|cancelled|completed)
- notes (TEXT, nullable)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
- completed_at (TIMESTAMP, nullable)
```

## Row Level Security (RLS)

The schema includes RLS policies for multi-tenant support:

- Public read access for active trainers and available slots
- Trainers can only manage their own data (will be enforced with auth)
- Clients can see their own reservations

These policies will be enhanced once authentication is implemented.

## Testing the Connection

After setup, test the connection by running the development server:

```bash
npm run dev
```

Then visit `http://localhost:3000/api/coaches` to verify the API can connect to Supabase.

## Troubleshooting

### "Missing Supabase environment variables"
- Ensure `.env.local` has `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Restart the development server after adding env vars

### "Connection refused"
- Check that your Supabase project is running
- Verify the project URL is correct
- Check your internet connection

### "Permission denied" errors
- Ensure your anon key has proper permissions
- Check RLS policies in Supabase dashboard
- Use service role key for admin operations

## Next Steps

1. Add sample trainer data to test
2. Test the reservation widget integration
3. Set up authentication (Clerk, Auth0, or Supabase Auth)
4. Deploy to production (Vercel + Supabase)
