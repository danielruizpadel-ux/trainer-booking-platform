# ROADMAP

This roadmap is intentionally lightweight.

Existing documentation and the actual codebase remain the source of truth for detailed implementation status.

## NOW

### Shared AI project brain
- Establish shared project context.
- Establish durable decision tracking.
- Establish a shared AI workflow.
- Establish a clear roadmap.
- Keep GitHub as the source of truth.

### Codebase understanding
- Maintain the existing architecture.
- Avoid unnecessary rewrites.
- Resolve known issues before production deployment.
- Keep security constraints visible.

### Player accounts
- Phase A1 (24/09/2026, branch `emdash/player-login-yhk1z`): global player
  account at `/cuenta` — login, onboarding, profile editing, player↔trainer
  relationship (migration 009). Code done; migration not applied and not
  verified end-to-end yet. See `docs/PLAYER_ACCOUNTS.md`.
- Phase A2 (25/09/2026, same branch): English checkout (players 1–4,
  booking as / guest details, message to coach), editable per-trainer pricing
  (`trainer_session_prices`), `player_id` / `client_message` /
  `player_count` / `whatsapp_opt_in` on reservations, direct writes to
  `reservations` closed (migration 010, applied). Pending Dani's manual
  browser test and Codex review.
- Next: My Bookings, secure guest → account linking (per-reservation token),
  rate limiting on POST /api/reservations before production.

### Product
- Continue developing the trainer booking platform.
- Improve the trainer booking experience.
- Improve trainer dashboard functionality.
- Continue packages/calendar development where already planned.

## NEXT

Items already indicated by the project's existing documentation should be evaluated and converted into concrete tasks.

Priority should be determined from:
1. Existing project state.
2. User/business requirements.
3. Production readiness.
4. Security.
5. Reliability.
6. UX improvements.

Do not invent major product priorities without confirming them.

## LATER

Potential future work should be documented here only when it becomes a real project decision.

Ideas are not commitments.

## RULE

When work is completed:
- update the relevant documentation if necessary
- update this roadmap
- commit the change
- push to GitHub when appropriate

Never mark work as complete based only on an AI agent's assumption.
