import assert from "node:assert/strict";
import test from "node:test";

import {
  assessAgentParticipation,
  nextStateAfterSynthesis,
  phasePlanForMode,
  readOnlyWorktreeChanges,
} from "./orchestrate-v1.mjs";

test("implementation mode continues to implementation after synthesis", () => {
  assert.equal(nextStateAfterSynthesis("IMPLEMENTATION"), "IMPLEMENTATION");
});

test("read-only audit stops at the Dani handoff after synthesis", () => {
  assert.equal(nextStateAfterSynthesis("READ_ONLY_AUDIT"), "WAITING_FOR_DANI");
});

test("read-only audit accepts an unchanged worktree and ignores runtime Bothread data", () => {
  assert.deepEqual(
    readOnlyWorktreeChanges(
      { status: "?? .bothread/", diff: "" },
      "?? .bothread/\n?? .bothread/attachments/a.txt",
      "",
      [],
    ),
    [],
  );
  assert.deepEqual(phasePlanForMode("READ_ONLY_AUDIT"), [
    "RECEIVED",
    "CLAUDE_ANALYSIS",
    "CODEX_ANALYSIS",
    "SYNTHESIS",
    "WAITING_FOR_DANI",
  ]);
  assert.equal(
    phasePlanForMode("READ_ONLY_AUDIT").includes("IMPLEMENTATION"),
    false,
  );
  assert.equal(
    phasePlanForMode("READ_ONLY_AUDIT").includes("CODEX_REVIEW"),
    false,
  );
  assert.equal(
    phasePlanForMode("READ_ONLY_AUDIT").includes("CLAUDE_FIX"),
    false,
  );
});

test("read-only audit reports exact unauthorized changed paths", () => {
  assert.deepEqual(
    readOnlyWorktreeChanges(
      { status: "?? .bothread/", diff: "" },
      " M docs/ORCHESTRATOR_V1.md\n?? .bothread/attachments/a.txt",
      "diff --git a/docs/ORCHESTRATOR_V1.md b/docs/ORCHESTRATOR_V1.md",
      ["docs/ORCHESTRATOR_V1.md"],
    ),
    ["docs/ORCHESTRATOR_V1.md"],
  );
});

test("agent participation requires independently observed join and message", () => {
  assert.deepEqual(
    assessAgentParticipation(
      {
        participants: [{ name: "Claude" }],
        snapshot: { thread: [{ author: "Claude", text: "analysis" }] },
      },
      "Claude",
    ),
    { joined: true, messagePublished: true },
  );
  assert.deepEqual(
    assessAgentParticipation(
      { participants: [], snapshot: { thread: [] } },
      "Codex",
    ),
    { joined: false, messagePublished: false },
  );
});
