# Development Guide - Trainer Booking Platform

## Architecture Overview

### Multi-Trainer SaaS Model

The platform is designed to support multiple trainers, each with their own:
- Web portal (`/web/[trainerId]`)
- Reservation system
- Admin dashboard
- Embedded booking widget

### API Structure

All APIs follow RESTful conventions and return JSON responses with consistent structure:

```json
{
  "success": boolean,
  "data": object | null,
  "error": string | null
}
```

### Database Schema

Key tables in Supabase:
- `trainers` - Trainer/coach information
- `clients` - Client contact information
- `reservations` - Booking records
- `availability_slots` - Trainer availability
- `trainer_accounts` - Subscription management

## Development Phases

### Phase 1: Project Setup ✅
- [x] Initialize Next.js project
- [x] Configure Tailwind CSS
- [x] Set up TypeScript
- [x] Create project structure
- [x] Initialize Supabase client

### Phase 2: Reservation Widget (In Progress)
- [ ] Create ReservationWidget component
- [ ] Implement date/time selection
- [ ] Client form integration
- [ ] API integration

### Phase 3: Web Portal Integration
- [ ] Create trainer web portal layout
- [ ] Integrate reservation widget
- [ ] Add hero section
- [ ] Add contact section

### Phase 4: Admin Dashboard
- [ ] Admin login page
- [ ] Reservation management
- [ ] Availability management
- [ ] Analytics dashboard

### Phase 5: Deployment
- [ ] Configure Vercel deployment
- [ ] Set up environment variables
- [ ] Production testing
- [ ] Documentation

## Code Guidelines

### Naming Conventions

- **Components:** PascalCase (e.g., `ReservationWidget`)
- **Hooks:** camelCase with `use` prefix (e.g., `useReservations`)
- **Functions:** camelCase (e.g., `createReservation`)
- **Constants:** SCREAMING_SNAKE_CASE (e.g., `MAX_RESERVATIONS_PER_DAY`)
- **Files:** kebab-case for utilities, PascalCase for components

### File Structure

- `components/*.tsx` - React components
- `app/api/*.ts` - API routes
- `lib/services/*.ts` - Business logic
- `lib/utils/*.ts` - Helper functions
- `lib/domain/*.ts` - Type definitions

### TypeScript Usage

- Always use explicit types for function parameters and returns
- Define interfaces for API requests/responses
- Use `type` for type aliases, `interface` for object shapes when extending

### Comments

- Document complex logic with `// Single line` comments
- Use block comments for file headers
- Explain the "why" not the "what"

## Environment Variables

Required environment variables (see `.env.example`):

```
NEXT_PUBLIC_SUPABASE_URL      - Your Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY - Your Supabase anonymous key
ADMIN_PASSWORD                - Admin panel password
```

## Common Tasks

### Adding a New API Endpoint

1. Create route file: `app/api/[resource]/route.ts`
2. Implement GET/POST/PATCH/DELETE handlers
3. Use consistent response format
4. Add error handling and validation

### Creating a New Component

1. Create file in `components/`
2. Export default or named export
3. Add TypeScript props interface
4. Include JSDoc comments for props
5. Keep component focused and reusable

### Adding Database Schema

1. Create migration files in `migrations/`
2. Write migration SQL
3. Document table structure
4. Update TypeScript types

## Testing

- Use built-in testing tools
- Aim for component integration tests
- Test API endpoints with `curl` or API client

## Performance Considerations

- Use React.memo for expensive components
- Implement code splitting with dynamic imports
- Optimize images with next/image
- Cache API responses when appropriate
- Monitor bundle size with `npm run build`

## Security

- Validate all user input on the server
- Use HTTPS in production
- Implement CSRF protection for state-changing operations
- Sanitize data before storing in database
- Use environment variables for sensitive data
- Admin password is hashed before comparison (implement in auth service)
