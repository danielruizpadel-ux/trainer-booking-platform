# DECISIONS

This file records durable project decisions so future AI agents do not repeatedly reconsider the same architectural choices.

## Decision 001 — GitHub is the shared source of truth
**Status:** Active

The GitHub repository on `main` is the shared source of truth for the project.

AI agents must not treat their own conversation history or local assumptions as authoritative.

## Decision 002 — Existing architecture is preserved
**Status:** Active

The existing application should be extended rather than casually rebuilt.

Before changing architecture, the relevant implementation and documentation must be inspected.

## Decision 003 — CLAUDE.md remains the project rulebook
**Status:** Active

CLAUDE.md contains project-specific development constraints and must be read before making code changes.

## Decision 004 — Database documentation is authoritative
**Status:** Active

`docs/DATABASE.md` is the documented database source of truth.

Do not invent schema details from memory.

## Decision 005 — Secrets stay outside Git
**Status:** Active

Environment secrets belong in local environment configuration and must never be copied into source files, documentation or commits.

## Decision 006 — AI agents have roles, not ownership
**Status:** Active

Claude, Codex, Gemini and ChatGPT may have different operational roles, but none of them individually owns the project.

The repository and documented decisions remain authoritative.

## Decision 007 — Changes should be incremental
**Status:** Active

Prefer small, understandable changes over large rewrites.

Every meaningful change should be reviewable through Git.

## Decision 008 — Calendar-first UI language and visual reference
**Status:** Active

The booking calendar is the visual reference for the public web, the player
account and the trainer dashboard. New calendar, availability and booking UI
should reuse its interaction patterns and visual language instead of creating a
parallel calendar style.

The public web and dashboard UI use English. Existing Spanish documentation and
internal notes may remain Spanish unless a product decision changes that scope.

## Decision 009 — Player Development Plan is a fixed pack
**Status:** Active, future scope

Player Development Plan is a fixed pack of 10 sessions, not a recurring
subscription. Session 1 is the assessment; the remaining 9 sessions are the
completion plan. The agreed reference prices are RM300 for the assessment,
RM2,700 for the remaining 9 sessions, RM3,000 total, and RM375 for a premium
single session. The completion offer is available for 24 hours after the
assessment; the remaining-plan saving is RM675 versus nine premium sessions.
The total-plan reference saving versus ten premium single sessions is RM750.

The plan may be shared between the assigned trainers (currently represented by
Dani and Denzel in the prototype). These are product rules only: no billing,
recurring subscription, credit consumption or production data model is being
implemented in the current booking work.
