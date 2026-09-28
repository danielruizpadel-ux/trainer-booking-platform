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

### Product
- Continue developing the trainer booking platform.
- Improve the trainer booking experience.
- Improve trainer dashboard functionality.
- Continue packages/calendar development where already planned.

### A2 and UI consolidation
- Reconcile the A2 implementation reported by Claude with the actual worktree;
  the current checkout does not contain the complete A2 diff.
- Keep the reservation calendar style as the shared reference for web, account
  and dashboard UI. Keep web and dashboard copy in English.
- Resolve the generic `/[trainerSlug]` route before attempting a full booking
  test; it currently remains on the legacy booking payload.

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

### Release gate before real reservations

- Consolidate A2 and UI changes in one reviewable diff.
- Verify the applied migrations and deployed schema against the repository
  documentation.
- Complete the end-to-end booking test in a test environment without using
  production reservations.
- Close the UI review items: hours-modal accessibility, mini-calendar date,
  **Book Session** button and admin-console credential registration.
- Re-run type-check and the available non-mutating checks, then perform the
  browser test matrix before opening real reservations.

## LATER

Potential future work should be documented here only when it becomes a real project decision.

Ideas are not commitments.

### Player Development Plan

Documented product rules are in Decision 009. Future work may implement the
fixed 10-session pack, assessment-to-offer flow, 24-hour offer window,
trainer-sharing model and booking integration. It must remain a fixed pack and
must not be implemented as a recurring subscription. No implementation is
planned in the current A2/UI consolidation task.

## RULE

When work is completed:
- update the relevant documentation if necessary
- update this roadmap
- commit the change
- push to GitHub when appropriate

Never mark work as complete based only on an AI agent's assumption.
