# AI WORKFLOW

Start with [the central project control map](docs/CONTROL_DEL_PROYECTO.md); it explains how shared protocol changes move from `main` to `develop` and reviewed product changes move back.

## Purpose

This repository is designed to be worked on by multiple AI agents.

The goal is continuity: any agent should be able to enter the repository, understand the current state and continue work without depending on private conversation history.

## Source of Truth

Priority order:

1. Actual code
2. GitHub repository
3. CLAUDE.md
4. Relevant project documentation
5. DECISIONS.md
6. ROADMAP.md
7. AI agent conversation/context

If conversation memory conflicts with the repository, inspect the repository.

## Before Changing Code

Every AI agent must:

1. Read `CLAUDE.md`.
2. Read the relevant documentation.
3. Inspect the relevant code.
4. Check current git status.
5. Understand existing patterns before creating new ones.
6. Avoid unnecessary architectural changes.

## After Changing Code

The agent should:

1. Review the diff.
2. Run the relevant checks.
3. Confirm no unrelated files were changed.
4. Update documentation when the change creates a durable project decision.
5. Explain what changed and any remaining uncertainty.

## Git Rules

- `main` is the accepted branch. `develop` is the declared working base for new feature branches; it was created from `emdash/integracion-programa` at `7e6357e` on 28/09/2026. Always record the current base SHA. PR #4 integrated the shared protocol into `main`, and PR #6 brought the same board and protocol to `develop`. The reviewed link between these branches preserves the product work on `develop`. Draft PR #3 proposes product changes for `main` separately. Do not silently start new work from `main` or merge into it.
- Do not rewrite Git history unless explicitly authorized.
- Do not force-push.
- Do not commit secrets.
- Do not commit `.env.local`.
- Keep commits understandable.
- Check `git diff` before committing.

## Task and asset continuity

Read [the master product and delivery plan](docs/PLAN_MAESTRO_PRODUCTO_Y_ENTREGA.md) for the current two-track roadmap, task template, worktree inventory, image asset checks and merge order. Before opening a new worktree, inspect existing local trees and remote backup branches. A chat, a local-only file and an ignored orchestrator run are not a project handoff. Commit and push authorized work to its task branch and create a reviewable PR against the declared base; record the outcome in the relevant repository document.

Orchestrator V1 requires both Claude and Codex. When either is unavailable, bounded work may continue through the declared task branch and independent review process; do not label it an orchestrated run.

## Multi-Agent Coordination

Do not have two agents independently modify the same feature at the same time unless their work is explicitly coordinated.

Before starting a significant task:
- check the current branch
- check git status
- inspect recent commits
- understand whether another agent's work is already in progress

## Roles

### Claude Code
Primary implementation agent for substantial code changes when available.

Responsibilities:
- architecture-aware implementation
- feature development
- debugging
- repository-level changes

### Codex
Secondary implementation/review agent.

Responsibilities:
- implementation
- debugging
- code review
- independent technical validation

### Gemini
Second-opinion/research/review agent.

Responsibilities:
- alternative technical approaches
- research
- identifying blind spots
- reviewing proposed solutions

### ChatGPT
Product/strategy/architecture/QA coordination layer.

Responsibilities:
- clarify requirements
- break work into tasks
- evaluate trade-offs
- review plans
- coordinate agent roles
- help maintain project context

These roles are operational suggestions, not authority levels.

## Shared Memory

### PROJECT_CONTEXT.md
High-level project context.

### DECISIONS.md
Durable decisions and their rationale.

### ROADMAP.md
Current and future project direction.

### AI_WORKFLOW.md
Rules for collaboration between AI agents.

## Documentation Rules

Do not create duplicate documentation when an existing document already covers the topic.

Update the most relevant existing document instead.

## Security

Never place:
- API keys
- service-role keys
- passwords
- authentication tokens
- private credentials

inside documentation or source control.

Never print secret values into AI conversations.

## Production

Before deployment:
- read `docs/ANTES_DE_PUBLICAR.md`
- verify known security issues
- verify environment configuration
- run appropriate checks

## Golden Rule

The AI agent is not the source of truth.

The repository is.
