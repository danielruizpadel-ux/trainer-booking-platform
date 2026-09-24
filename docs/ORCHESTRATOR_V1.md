# Orchestrator V1

Orchestrator V1 is a small local controller for one task at a time. It is not
an agent framework and it is not a deployment system.

## Scope

The controller runs this deterministic sequence:

```text
RECEIVED
  -> Claude independent analysis
  -> Codex independent analysis
  -> Claude synthesis / implementation plan
  -> Claude implementation
  -> Codex review
  -> Claude fix + Codex re-review (at most three review rounds)
  -> WAITING_FOR_DANI | ESCALATED_TO_DANI | FAILED
```

`WAITING_FOR_DANI` is deliberately terminal. An accepted review never commits,
pushes, merges, deploys, runs a migration, changes credentials, or starts a
second task. Dani receives the final report and decides the next action.

## Prerequisites

- Node 20 and the repository dependencies already installed.
- `claude` and `codex` CLIs available on `PATH` with their existing local
  authentication.
- A clean working tree before starting. The only allowed pre-existing
  untracked path is `.bothread/`; this is needed so work from a prior person or
  agent cannot be mistaken for the current run.
- Bothread running locally at the configured endpoint. Development missions
  create their own room automatically through the local Bothread API, persist
  its room/session identifiers in the run record, and use its MCP endpoint for
  coordination. Bothread setup and relay failures fail the mission safely;
  Bothread never decides workflow transitions.

No credential values belong in `policy.json`, a run record, a prompt, or a
Bothread message.

## Usage

The terminal is the V1 operational interface. A web Control Center may be
added later, but is not part of V1.

### Start / check system

```bash
npm run company:start
```

This is a read-only bootstrap check: it verifies the repository, Node, CLI
availability, Bothread reachability, run storage, worktree status and the
active-run lock. It does not invoke an LLM or start a mission. If Bothread is
unreachable it reports the configured endpoint; V1 does not assume or invent a
startup command for it.

### New mission

```bash
npm run company -- "Describe one bounded task"
```

### Check status

```bash
npm run company:status
```

### Recover after interruption

```bash
npm run company:resume
```

`company:resume` proceeds only when exactly one persisted non-terminal run is
safe to resume. It refuses to guess among multiple candidates, and terminal
runs are never restarted.

### Deep diagnostic

```bash
npm run company:doctor
```

The underlying controller commands remain available for diagnostics:

```bash
node orchestrator/orchestrate-v1.mjs --resume run_1234567890_abcd1234
node orchestrator/orchestrate-v1.mjs --help
```

The controller writes one JSON record per run to `orchestrator/runs/`. These
records are ignored by Git because they can contain agent analysis, diffs and
machine-local execution details. They are a recovery/audit record for the
operator, not project documentation.

Only one controller may use a working tree at once. It creates
`orchestrator/runs/.active.lock`; a lock from a dead process is reclaimed by
PID check. Do not remove a live lock manually.

## Policy and validation

`orchestrator/policy.json` contains static CLI command names, timeouts, the
review limit, Bothread endpoint metadata and validation commands. It contains
no secret values.

Claude receives only file-oriented tools during analysis and implementation;
it receives no Bash tool. Codex runs in read-only sandbox for analysis and
review. The Node controller invokes validation commands itself after an
implementation or fix, records their output, and gives it to Codex.

The project currently has documented pre-existing TypeScript errors. A failed
validation is therefore evidence for the reviewer and Dani, not an automatic
approval or an automatic claim that a change introduced every reported error.

## Bothread protocol

Each development mission creates a dedicated local Bothread room before any
agent runs. The controller persists the opaque room session ID used by
`join_session` plus the separate API room ID; neither is the MCP transport
session ID. It joins as `Orchestrator V1`, posts the task, relays bounded Codex
analysis/review/validation output, records decisions and final verification
notes, then leaves. Claude receives the room session ID in every phase prompt
and must join/read/post; it claims files before edits and releases them after.

Bothread is required coordination infrastructure in development mode, so a
creation, join, or relay failure fails the run rather than silently continuing.
Node owns all state transitions and parses Codex's explicit verdict marker;
Git and the persisted run JSON remain the recovery source of truth.

The required review markers are:

```text
ORCHESTRATOR_VERDICT: ACCEPTED
ORCHESTRATOR_VERDICT: CHANGES_REQUESTED
```

Missing or ambiguous markers produce one format retry; a second invalid result
fails safely instead of guessing the verdict.

## Recovery and stop conditions

- Resume a non-terminal run using its run ID after an interruption.
- On resume, V1 reinitializes its MCP transport and rejoins the persisted
  Bothread room. It never creates a second room for the same run.
- Before each Claude mutation step, V1 atomically persists a marker. If the
  machine stops after that marker but before Claude's result is recorded, the
  working tree may already have been modified. Recovery is then ambiguous: V1
  records a clear `FAILED` reason and stops for Dani rather than repeating the
  mutation automatically.
- Do not resume a terminal run as if it were active; it only prints its final
  report.
- `ESCALATED_TO_DANI` means the three-review limit was reached.
- `FAILED` means an agent process, parser, transition or prerequisite failed.
- `WAITING_FOR_DANI` means Codex accepted the work and the controller has
  stopped. It is not permission to commit or deploy.
- If Claude or Codex is unavailable (including a usage limit), V1 records the
  process error in the run and finishes as `FAILED`. It does not substitute one
  agent for the other; choosing a replacement requires Dani's decision.

For changes affecting architecture, security, database schema/data, production
or a protected area named in `CLAUDE.md`, stop and follow the human-approval
rules in `CLAUDE.md` and `AI_WORKFLOW.md`.
