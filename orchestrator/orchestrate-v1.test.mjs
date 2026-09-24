import assert from "node:assert/strict";
import test from "node:test";

import {
  assessAgentParticipation,
  assessBothreadIntegration,
  buildClaudeArgs,
  buildCodexArgs,
  nextStateAfterSynthesis,
  phasePlanForMode,
  readOnlyWorktreeChanges,
} from "./orchestrate-v1.mjs";

const COMMUNICATION_TOOLS = [
  "join_session",
  "get_room_state",
  "send_message",
  "record_note",
  "leave_session",
];

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

test("Claude auto-approves only the explicit Bothread communication tools", () => {
  const args = buildClaudeArgs("test", {
    tools: "Read,Grep,Glob,mcp__bothread__join_session",
  });
  const allowed = args[args.indexOf("--allowed-tools") + 1];
  assert.equal(
    allowed,
    "mcp__bothread__join_session,mcp__bothread__get_room_state,mcp__bothread__send_message,mcp__bothread__record_note,mcp__bothread__leave_session",
  );
  assert.equal(allowed.includes("*"), false);
  assert.equal(allowed.includes("claim_files"), false);
  assert.deepEqual(args.slice(-2), ["--", "test"]);
});

test("Codex uses only per-process Bothread communication approvals", () => {
  const args = buildCodexArgs("test", { sandbox: "read-only" });
  const text = args.join("\n");
  assert.match(text, /mcp_servers\.bothread\.enabled_tools=/);
  for (const tool of COMMUNICATION_TOOLS) {
    assert.match(
      text,
      new RegExp(
        `mcp_servers\\.bothread\\.tools\\.${tool}\\.approval_mode=\\"auto\\"`,
      ),
    );
  }
  assert.doesNotMatch(text, /claim_files|release_files|bypass|dangerously/);
});

test("failed approvals remain degraded and name every affected agent", () => {
  const denied = {
    joinRequested: true,
    mcpToolCallObserved: true,
    joined: false,
    messagePublished: false,
    approvalDenied: true,
    unsupported: false,
  };
  const result = assessBothreadIntegration(denied, denied);
  assert.equal(result.integration, "DEGRADED");
  assert.match(result.degradedReason, /Claude: aprobación MCP denegada/);
  assert.match(result.degradedReason, /Codex: aprobación MCP denegada/);
});
