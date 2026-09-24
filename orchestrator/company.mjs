#!/usr/bin/env node
// Human-facing operational commands for Orchestrator V1. These commands only
// inspect local state unless explicitly asked to start or resume a mission.

import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const RUNS_DIR = path.join(__dirname, "runs");
const POLICY = JSON.parse(
  fs.readFileSync(path.join(__dirname, "policy.json"), "utf8"),
);
const LOCK_PATH = path.resolve(REPO_ROOT, POLICY.worktree.lockFile);
const TERMINAL_STATES = new Set([
  "WAITING_FOR_DANI",
  "ESCALATED_TO_DANI",
  "FAILED",
]);
const RECOVERABLE_STATES = new Set([
  "RECEIVED",
  "CLAUDE_ANALYSIS",
  "CODEX_ANALYSIS",
  "SYNTHESIS",
  "IMPLEMENTATION",
  "CODEX_REVIEW",
  "CLAUDE_FIX",
]);

function run(command, args, { cwd = REPO_ROOT, timeoutMs = 5000 } = {}) {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      { cwd, timeout: timeoutMs, shell: false },
      (error, stdout, stderr) => {
        resolve({
          ok: !error,
          code: typeof error?.code === "number" ? error.code : error ? -1 : 0,
          stdout: stdout?.trim() ?? "",
          stderr: stderr?.trim() ?? "",
        });
      },
    );
  });
}

function marker(runRecord) {
  const started = [...(runRecord.history ?? [])]
    .reverse()
    .find((entry) => entry.kind === "claude_mutation_started");
  if (!started) return null;
  const completedKind =
    started.phase === "implementation" ? "implementation" : "claude_fix";
  const index = runRecord.history.indexOf(started);
  return runRecord.history
    .slice(index + 1)
    .some((entry) => entry.kind === completedKind)
    ? null
    : started;
}

export function recoveryAssessment(runRecord) {
  if (TERMINAL_STATES.has(runRecord.status)) {
    return { recoverable: false, reason: "terminal" };
  }
  if (!RECOVERABLE_STATES.has(runRecord.status)) {
    return { recoverable: false, reason: "unknown state" };
  }
  const mutation = marker(runRecord);
  if (mutation) {
    return {
      recoverable: false,
      reason: `ambiguous Claude ${mutation.phase} in progress`,
    };
  }
  return { recoverable: true, reason: "safe to resume" };
}

export function readRuns(runsDir = RUNS_DIR) {
  if (!fs.existsSync(runsDir)) return { runs: [], malformed: [] };
  const runs = [];
  const malformed = [];
  for (const name of fs.readdirSync(runsDir)) {
    if (!/^run_.*\.json$/.test(name)) continue;
    try {
      const parsed = JSON.parse(
        fs.readFileSync(path.join(runsDir, name), "utf8"),
      );
      if (!parsed.runId || !parsed.status)
        throw new Error("faltan runId o status");
      runs.push(parsed);
    } catch (error) {
      malformed.push({ name, error: error.message });
    }
  }
  runs.sort((a, b) => {
    const aTime = Date.parse(a.updatedAt ?? a.createdAt ?? "") || 0;
    const bTime = Date.parse(b.updatedAt ?? b.createdAt ?? "") || 0;
    return bTime - aTime;
  });
  return { runs, malformed };
}

export function selectResumeRun(runs) {
  const candidates = runs.filter(
    (runRecord) => recoveryAssessment(runRecord).recoverable,
  );
  if (candidates.length === 1) return { run: candidates[0], candidates };
  return { run: null, candidates };
}

export function inspectLock(lockPath = LOCK_PATH) {
  if (!fs.existsSync(lockPath)) return { state: "none" };
  try {
    const data = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    try {
      process.kill(data.pid, 0);
      return { state: "live", runId: data.runId, pid: data.pid };
    } catch (error) {
      if (error.code === "ESRCH")
        return { state: "stale", runId: data.runId, pid: data.pid };
      return { state: "warning", runId: data.runId, pid: data.pid };
    }
  } catch (error) {
    return { state: "invalid", error: error.message };
  }
}

async function checkBothread() {
  try {
    const response = await fetch(POLICY.bothread.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "company-doctor",
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "orchestrator-v1-doctor", version: "0.1.0" },
        },
      }),
      signal: AbortSignal.timeout(3000),
    });
    await response.text();
    return { ok: response.ok, detail: `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, detail: error.message };
  }
}

async function doctorData() {
  const repo = await run("git", ["rev-parse", "--show-toplevel"]);
  const repository = repo.ok && path.resolve(repo.stdout) === REPO_ROOT;
  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10);
  const claude = await run(POLICY.claude.command, ["--version"]);
  const codex = await run(POLICY.codex.command, ["--version"]);
  const bothread = await checkBothread();
  const storage =
    fs.existsSync(RUNS_DIR) && fs.statSync(RUNS_DIR).isDirectory();
  const worktree = await run("git", ["status", "--short"]);
  const unexpectedChanges = worktree.stdout
    .split("\n")
    .filter(Boolean)
    .filter((line) => line !== "?? .bothread/");
  return {
    repository,
    node: { ok: nodeMajor >= 20, version: process.version },
    claude: { ok: claude.ok, version: claude.stdout || claude.stderr },
    codex: { ok: codex.ok, version: codex.stdout || codex.stderr },
    bothread,
    storage,
    worktree: { ok: worktree.ok, changes: unexpectedChanges },
    lock: inspectLock(),
    runs: readRuns(),
  };
}

function icon(ok) {
  return ok ? "✓" : "✗";
}

function printDoctor(data) {
  process.stdout.write("TRAINER BOOKING — AI COMPANY\n\n");
  process.stdout.write(`Repository             ${icon(data.repository)}\n`);
  process.stdout.write(
    `Node version           ${icon(data.node.ok)} ${data.node.version}\n`,
  );
  process.stdout.write(
    `Claude CLI installed   ${icon(data.claude.ok)}${data.claude.ok ? "" : " (install or restore PATH)"}\n`,
  );
  process.stdout.write(
    `Codex CLI installed    ${icon(data.codex.ok)}${data.codex.ok ? "" : " (install or restore PATH)"}\n`,
  );
  process.stdout.write(
    `Bothread reachable     ${icon(data.bothread.ok)}${data.bothread.ok ? "" : " (check http://127.0.0.1:4889/mcp manually; no startup command is assumed)"}\n`,
  );
  const latestRun = data.runs.runs[0];
  process.stdout.write(
    `Latest Bothread room   ${latestRun?.bothreadRoomId || latestRun?.bothreadSessionId ? "present" : "none"}\n`,
  );
  process.stdout.write(`Run storage            ${icon(data.storage)}\n`);
  const worktreeLabel =
    data.worktree.ok && data.worktree.changes.length === 0 ? "✓" : "warning";
  process.stdout.write(
    `Worktree status        ${worktreeLabel}${data.worktree.changes.length ? ` (${data.worktree.changes.join(", ")})` : ""}\n`,
  );
  const lockLabel = data.lock.state === "none" ? "✓" : "warning";
  process.stdout.write(
    `Active run lock        ${lockLabel}${data.lock.state === "none" ? "" : ` (${data.lock.state})`}\n`,
  );
  if (data.runs.malformed.length) {
    process.stdout.write(
      `Run records            warning (${data.runs.malformed.map((item) => item.name).join(", ")})\n`,
    );
  }
}

function printStatus(runRecord) {
  if (!runRecord) {
    process.stdout.write("No persisted Orchestrator runs found.\n");
    return;
  }
  const recovery = recoveryAssessment(runRecord);
  const bothread = runRecord.bothread ?? {};
  const claudeBothread = bothread.claude ?? {};
  const codexBothread = bothread.codex ?? {};
  process.stdout.write(
    [
      `Run ID:                 ${runRecord.runId}`,
      `Task:                   ${runRecord.task}`,
      `Mission mode:           ${runRecord.mode ?? "IMPLEMENTATION"}`,
      `State:                  ${runRecord.status}`,
      `Created:                ${runRecord.createdAt ?? "unknown"}`,
      `Updated:                ${runRecord.updatedAt ?? "unknown"}`,
      `Review iteration:       ${runRecord.reviewIteration ?? 0}`,
      `Claude session:         ${runRecord.claudeSessionId ? "present" : "none"}`,
      `Codex thread:           ${runRecord.codexThreadId ? "present" : "none"}`,
      `Bothread room:          ${runRecord.bothreadRoomId ? "present" : "none"}`,
      `Bothread session:       ${runRecord.bothreadRoomId ? "protected; resolved locally" : "none"}`,
      `Bothread orchestrator:  ${bothread.orchestratorJoined ? "joined" : "not joined"}`,
      `Bothread Claude:        attempted ${claudeBothread.joinAttempted ? "yes" : "no"}; joined ${claudeBothread.joined ? "yes" : "no"}; published ${claudeBothread.messagePublished ? "yes" : "no"}`,
      `Bothread Codex:         attempted ${codexBothread.joinAttempted ? "yes" : "no"}; joined ${codexBothread.joined ? "yes" : "no"}; published ${codexBothread.messagePublished ? "yes" : "no"}`,
      `Bothread integration:   ${bothread.integration ?? "unknown"}${bothread.degradedReason ? ` (${bothread.degradedReason})` : ""}`,
      `Last error:             ${runRecord.lastError ?? "none"}`,
      `Terminal:               ${TERMINAL_STATES.has(runRecord.status) ? "yes" : "no"}`,
      `Recovery/resume:        ${recovery.recoverable ? "possible" : `not automatic (${recovery.reason})`}`,
    ].join("\n") + "\n",
  );
}

function printInterrupted(runs) {
  const nonTerminal = runs.filter(
    (runRecord) => !TERMINAL_STATES.has(runRecord.status),
  );
  if (nonTerminal.length === 0) {
    process.stdout.write(
      '\nNo interrupted run.\n\nStart a mission with:\nnpm run company -- "TASK"\n',
    );
    return;
  }
  const selection = selectResumeRun(runs);
  if (selection.run) {
    process.stdout.write(
      `\nInterrupted run detected:\n${selection.run.runId}\nState: ${selection.run.status}\n\nResume with:\nnpm run company:resume\n`,
    );
    return;
  }
  process.stdout.write(
    "\nInterrupted runs need Dani's review before recovery:\n",
  );
  for (const runRecord of nonTerminal) {
    process.stdout.write(
      `- ${runRecord.runId} (${runRecord.status}; ${recoveryAssessment(runRecord).reason})\n`,
    );
  }
}

async function spawnOrchestrator(args) {
  const child = spawn(
    process.execPath,
    [path.join(__dirname, "orchestrate-v1.mjs"), ...args],
    { cwd: REPO_ROOT, stdio: "inherit" },
  );
  return new Promise((resolve) =>
    child.on("exit", (code) => resolve(code ?? 1)),
  );
}

function printUsage() {
  process.stdout.write(
    'Usage: npm run company -- "TASK" | npm run company:audit -- "MISSION" | company:start | company:doctor | company:status | company:resume\n',
  );
}

export async function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  if (command === "doctor") {
    printDoctor(await doctorData());
    return;
  }
  if (command === "status") {
    const { runs, malformed } = readRuns();
    printStatus(runs[0]);
    if (malformed.length)
      process.stdout.write(
        `Warning: unreadable run records: ${malformed.map((item) => item.name).join(", ")}\n`,
      );
    return;
  }
  if (command === "start") {
    const data = await doctorData();
    printDoctor(data);
    const prerequisitesOk =
      data.repository &&
      data.node.ok &&
      data.claude.ok &&
      data.codex.ok &&
      data.bothread.ok &&
      data.storage &&
      data.worktree.ok &&
      data.worktree.changes.length === 0 &&
      data.lock.state === "none";
    process.stdout.write(
      prerequisitesOk
        ? "\nSystem ready.\n"
        : "\nSystem is not ready; fix the failed checks above.\n",
    );
    printInterrupted(data.runs.runs);
    return;
  }
  if (command === "resume") {
    const { runs } = readRuns();
    const selection = selectResumeRun(runs);
    if (!selection.run) {
      const nonTerminal = runs.filter(
        (runRecord) => !TERMINAL_STATES.has(runRecord.status),
      );
      process.stderr.write(
        nonTerminal.length
          ? `Cannot safely select a run. Available non-terminal runs: ${nonTerminal.map((runRecord) => runRecord.runId).join(", ")}\n`
          : "No recoverable non-terminal run found.\n",
      );
      process.exitCode = 2;
      return;
    }
    process.exitCode = await spawnOrchestrator([
      "--resume",
      selection.run.runId,
    ]);
    return;
  }
  if (command === "mission") {
    const task = rest.join(" ").trim();
    if (!task) {
      process.stderr.write('A task is required: npm run company -- "TASK"\n');
      process.exitCode = 2;
      return;
    }
    process.exitCode = await spawnOrchestrator([task]);
    return;
  }
  if (command === "audit") {
    const task = rest.join(" ").trim();
    if (!task) {
      process.stderr.write(
        'An audit mission is required: npm run company:audit -- "MISSION"\n',
      );
      process.exitCode = 2;
      return;
    }
    process.exitCode = await spawnOrchestrator([
      "--mode",
      "READ_ONLY_AUDIT",
      task,
    ]);
    return;
  }
  printUsage();
  process.exitCode = 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
