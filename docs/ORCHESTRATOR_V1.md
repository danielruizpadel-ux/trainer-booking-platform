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
- Optionally, a Bothread session ID in `BOTHREAD_SESSION_ID` or passed with
  `--bothread-session`. The controller uses the local Bothread MCP HTTP
  endpoint configured in `orchestrator/policy.json` and only sends redacted
  status/audit messages. Bothread failure is recorded but cannot advance a
  workflow state.

No credential values belong in `policy.json`, a run record, a prompt, or a
Bothread message.

## Usage

```bash
node orchestrator/orchestrate-v1.mjs "Describe one bounded task"
node orchestrator/orchestrate-v1.mjs "Describe one bounded task" --bothread-session "$BOTHREAD_SESSION_ID"
node orchestrator/orchestrate-v1.mjs --resume run_1234567890_abcd1234
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

When a session ID is supplied, the controller joins as `Orchestrator V1`, posts
state updates and analysis/review relays, records the agreed plan as a decision
note, sends the final report, then leaves. Bothread is an audit and discussion
bus only: Node owns all state transitions and parses Codex's explicit verdict
marker.

The required review markers are:

```text
ORCHESTRATOR_VERDICT: ACCEPTED
ORCHESTRATOR_VERDICT: CHANGES_REQUESTED
```

Missing or ambiguous markers produce one format retry; a second invalid result
fails safely instead of guessing the verdict.

## Recovery and stop conditions

- Resume a non-terminal run using its run ID after an interruption.
- Do not resume a terminal run as if it were active; it only prints its final
  report.
- `ESCALATED_TO_DANI` means the three-review limit was reached.
- `FAILED` means an agent process, parser, transition or prerequisite failed.
- `WAITING_FOR_DANI` means Codex accepted the work and the controller has
  stopped. It is not permission to commit or deploy.

For changes affecting architecture, security, database schema/data, production
or a protected area named in `CLAUDE.md`, stop and follow the human-approval
rules in `CLAUDE.md` and `AI_WORKFLOW.md`.
