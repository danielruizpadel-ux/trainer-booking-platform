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
