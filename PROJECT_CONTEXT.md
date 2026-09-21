# PROJECT CONTEXT

## Purpose
This document is the shared high-level context for the Trainer Booking Platform.
It exists so different AI agents can understand the project without relying on conversation history.

## Source of Truth
The GitHub repository and the actual codebase are the source of truth.
Existing project documentation should be consulted before making architectural or product assumptions.

## Product
Trainer Booking Platform is a web platform for padel trainers/academies.

The current product includes trainer-specific public booking pages, availability management, reservations, packages and trainer dashboards.

The current production-oriented trainer example is Mauricio Martin ("Mauri").

## Stack
- Next.js
- React
- TypeScript
- Tailwind CSS
- Supabase
- Node.js
- Git/GitHub

See README.md and package.json for the exact current versions.

## Important Existing Documentation
- CLAUDE.md — project rules and architecture constraints
- README.md — project map
- DESIGN_SYSTEM.md — UI/design rules
- docs/DATABASE.md — database source of truth
- docs/BOOKING_FLOW.md — booking flow
- docs/ANTES_DE_PUBLICAR.md — pre-publication checklist
- docs/SETUP_TRAINER.md — trainer setup
- docs/estado-desarrollo.md — development state
- docs/PLAN_PAQUETES_Y_CALENDARIO.md — packages/calendar planning

Do not duplicate detailed information from these documents unnecessarily.

## Architecture
The application is structured around:
- Public trainer pages
- Booking flow
- Availability windows
- Reservations
- Trainer dashboard
- Trainer profile
- Packages
- Calendar
- API/server routes
- Supabase persistence

Availability is window-based. Classes/reservations exist inside availability windows.

Bookable start times should remain centralized in the existing availability logic.

## Security
- Secrets must never be committed to Git.
- `.env.local` must remain local and ignored.
- Never expose API keys, service-role keys or tokens in documentation.
- Read docs/ANTES_DE_PUBLICAR.md before any production deployment.
- Historical security concerns documented in CLAUDE.md must be resolved before production deployment.

## Current State
The project already contains a substantial working booking platform.

Do not rebuild existing functionality without first understanding the current implementation.

## Working Principle
Before modifying the application:
1. Read CLAUDE.md.
2. Read the relevant documentation.
3. Inspect the actual implementation.
4. Understand existing architecture.
5. Make the smallest appropriate change.
6. Run relevant checks.
7. Review git diff.

## Multi-Agent Principle
No AI agent is the ultimate authority.

GitHub + the repository documentation + the actual code are the shared source of truth.
