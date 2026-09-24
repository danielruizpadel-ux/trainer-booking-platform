#!/usr/bin/env node
// Orchestrator V1 — Node controla el flujo; Claude y Codex son procesos
// headless que solo devuelven texto. Bothread es el bus de auditoría, NUNCA
// decide transiciones. Ver docs/ORCHESTRATOR_V1.md para el diseño completo.
//
//   node orchestrator/orchestrate-v1.mjs "Fix booking capacity bug"
//   node orchestrator/orchestrate-v1.mjs --resume <runId>
//
// Sin dependencias npm nuevas: solo node:* built-ins.

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const RUNS_DIR = path.join(__dirname, "runs");
const POLICY = JSON.parse(
  fs.readFileSync(path.join(__dirname, "policy.json"), "utf8"),
);
const WORKTREE_LOCK = path.resolve(REPO_ROOT, POLICY.worktree.lockFile);
let heldWorktreeLock = null;

// ---------------------------------------------------------------------------
// Máquina de estados — el Node controller decide TODAS las transiciones.
// Ningún texto de Claude/Codex puede saltarse esta tabla.
// ---------------------------------------------------------------------------

const ALLOWED_TRANSITIONS = {
  RECEIVED: ["CLAUDE_ANALYSIS", "FAILED"],
  CLAUDE_ANALYSIS: ["CODEX_ANALYSIS", "FAILED"],
  CODEX_ANALYSIS: ["SYNTHESIS", "FAILED"],
  SYNTHESIS: ["IMPLEMENTATION", "WAITING_FOR_DANI", "FAILED"],
  IMPLEMENTATION: ["CODEX_REVIEW", "FAILED"],
  CODEX_REVIEW: [
    "WAITING_FOR_DANI",
    "CLAUDE_FIX",
    "ESCALATED_TO_DANI",
    "FAILED",
  ],
  CLAUDE_FIX: ["CODEX_REVIEW", "FAILED"],
  WAITING_FOR_DANI: [],
  ESCALATED_TO_DANI: [],
  FAILED: [],
};

function transition(run, next, reason) {
  const allowed = ALLOWED_TRANSITIONS[run.status] ?? [];
  if (!allowed.includes(next)) {
    throw new Error(
      `Transición no permitida: ${run.status} -> ${next} (permitidas: ${allowed.join(", ") || "ninguna, estado terminal"})`,
    );
  }
  const from = run.status;
  run.status = next;
  run.updatedAt = new Date().toISOString();
  run.history.push({
    ts: run.updatedAt,
    kind: "transition",
    from,
    to: next,
    reason,
  });
  saveRun(run);
  log(`[state] ${from} -> ${next}${reason ? ` (${reason})` : ""}`);
}

// ---------------------------------------------------------------------------
// Utilidades de log y redacción de secretos
// ---------------------------------------------------------------------------

function log(msg) {
  process.stderr.write(`${new Date().toISOString()} ${msg}\n`);
}

const SECRET_PATTERNS = [
  /sb_secret_[A-Za-z0-9_-]+/g,
  /sb_publishable_[A-Za-z0-9_-]+/g,
  /sk-[A-Za-z0-9_-]{10,}/g,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWT-shaped
  /SUPABASE_SERVICE_ROLE_KEY\s*=\s*\S+/g,
  /Bearer\s+[A-Za-z0-9._-]{10,}/g,
];

function redact(text) {
  if (typeof text !== "string") return text;
  let out = text;
  for (const re of SECRET_PATTERNS) out = out.replace(re, "[REDACTED]");
  return out;
}

// ---------------------------------------------------------------------------
// Estado del run — un único JSON por ejecución, escritura atómica
// ---------------------------------------------------------------------------

const MISSION_MODES = new Set(["IMPLEMENTATION", "READ_ONLY_AUDIT"]);

export function normalizeMissionMode(mode) {
  return MISSION_MODES.has(mode) ? mode : "IMPLEMENTATION";
}

export function nextStateAfterSynthesis(mode) {
  return normalizeMissionMode(mode) === "READ_ONLY_AUDIT"
    ? "WAITING_FOR_DANI"
    : "IMPLEMENTATION";
}

export function phasePlanForMode(mode) {
  const shared = ["RECEIVED", "CLAUDE_ANALYSIS", "CODEX_ANALYSIS", "SYNTHESIS"];
  return normalizeMissionMode(mode) === "READ_ONLY_AUDIT"
    ? [...shared, "WAITING_FOR_DANI"]
    : [
        ...shared,
        "IMPLEMENTATION",
        "CODEX_REVIEW",
        "CLAUDE_FIX",
        "WAITING_FOR_DANI",
      ];
}

function newBothreadState() {
  return {
    roomCreated: false,
    orchestratorJoined: false,
    claude: newAgentBothreadState(),
    codex: newAgentBothreadState(),
    integration: "PENDING",
    degradedReason: null,
  };
}

function newAgentBothreadState() {
  return {
    joinRequested: false,
    mcpToolCallObserved: false,
    joined: false,
    messagePublished: false,
    approvalDenied: false,
    unsupported: false,
  };
}

function newRun(task, mode, baseline) {
  const runId = `run_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  return {
    runId,
    task,
    mode: normalizeMissionMode(mode),
    status: "RECEIVED",
    createdAt: now,
    updatedAt: now,
    bothreadRoomId: null,
    bothread: newBothreadState(),
    claudeSessionId: null,
    codexThreadId: null,
    reviewIteration: 0,
    baseline,
    history: [],
    lastError: null,
  };
}

function isAllowedPreexistingStatus(line) {
  const match = /^\?\?\s+(.+)$/.exec(line);
  return Boolean(
    match && POLICY.worktree.allowedPreexistingUntracked.includes(match[1]),
  );
}

async function captureCleanBaseline() {
  const status = await gitStatusShort();
  const unexpected = status
    .split("\n")
    .filter(Boolean)
    .filter((line) => !isAllowedPreexistingStatus(line));
  if (unexpected.length > 0) {
    throw new Error(
      `El árbol de trabajo no está limpio antes de iniciar el run: ${unexpected.join(", ")}. ` +
        "El orquestador no puede atribuir esos cambios a un agente; revísalos o guárdalos antes de empezar.",
    );
  }
  return { status, diff: await gitDiff() };
}

function acquireWorktreeLock(runId) {
  fs.mkdirSync(path.dirname(WORKTREE_LOCK), { recursive: true });
  try {
    heldWorktreeLock = fs.openSync(WORKTREE_LOCK, "wx");
    fs.writeFileSync(
      heldWorktreeLock,
      JSON.stringify({
        runId,
        pid: process.pid,
        createdAt: new Date().toISOString(),
      }) + "\n",
    );
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    let existing = null;
    try {
      existing = JSON.parse(fs.readFileSync(WORKTREE_LOCK, "utf8"));
      process.kill(existing.pid, 0);
    } catch (lockError) {
      // ESRCH significa que el proceso que dejó el lock ya terminó: se recupera
      // automáticamente. Un lock ilegible se conserva para no arriesgar dos runs.
      if (existing && lockError?.code === "ESRCH") {
        fs.unlinkSync(WORKTREE_LOCK);
        return acquireWorktreeLock(runId);
      }
    }
    throw new Error(
      `Ya hay un run activo o un lock que requiere revisión manual: ${POLICY.worktree.lockFile} ` +
        `(detalle: ${existing ? `run ${existing.runId}, pid ${existing.pid}` : "lock ilegible"}).`,
    );
  }
}

function releaseWorktreeLock() {
  if (heldWorktreeLock === null) return;
  try {
    fs.closeSync(heldWorktreeLock);
  } finally {
    heldWorktreeLock = null;
    try {
      fs.unlinkSync(WORKTREE_LOCK);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    releaseWorktreeLock();
    process.exit(signal === "SIGINT" ? 130 : 143);
  });
}
process.once("exit", () => releaseWorktreeLock());

function runPath(runId) {
  return path.join(RUNS_DIR, `${runId}.json`);
}

function saveRun(run) {
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  const target = runPath(run.runId);
  const tmp = `${target}.${process.pid}.tmp`;
  const roomSessionId = run._bothreadSessionId;
  fs.writeFileSync(
    tmp,
    JSON.stringify(
      run,
      (key, value) => {
        if (key === "bothreadSessionId") return undefined;
        if (typeof value === "string" && roomSessionId)
          return value.split(roomSessionId).join("[REDACTED]");
        return value;
      },
      2,
    ),
  );
  fs.renameSync(tmp, target); // rename es atómico en el mismo filesystem
}

function loadRun(runId) {
  const p = runPath(runId);
  if (!fs.existsSync(p)) throw new Error(`No existe runs/${runId}.json`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function recordStep(run, kind, data) {
  run.history.push({ ts: new Date().toISOString(), kind, ...data });
  run.updatedAt = new Date().toISOString();
  saveRun(run);
}

function fail(run, error, nextState = "FAILED") {
  run.lastError = redact(String(error?.stack || error));
  log(`[error] ${run.lastError}`);
  transition(
    run,
    nextState,
    redact(String(error?.message || error)).slice(0, 300),
  );
}

// ---------------------------------------------------------------------------
// Ejecución de procesos hijos — sin shell, argv como array
// ---------------------------------------------------------------------------

function runProcess(command, args, { timeoutMs, cwd = REPO_ROOT } = {}) {
  return new Promise((resolve) => {
    const child = execFile(
      command,
      args,
      {
        cwd,
        timeout: timeoutMs,
        killSignal: "SIGKILL",
        maxBuffer: 64 * 1024 * 1024,
        shell: false,
      },
      (error, stdout, stderr) => {
        // execFile pone error.code a `null` cuando el proceso murió por señal
        // (timeout, kill) en vez de salir con un código numérico. `?? 0` ahí
        // convertiría un timeout en "éxito" — se fuerza -1 en ese caso.
        const code = !error
          ? 0
          : typeof error.code === "number"
            ? error.code
            : -1;
        resolve({
          code,
          killed: Boolean(error?.killed),
          timedOut: Boolean(error?.killed && Boolean(timeoutMs)),
          stdout: stdout ?? "",
          stderr: stderr ?? "",
        });
      },
    );
    // execFile crea stdin como pipe. Si se deja abierto, Claude --print espera
    // hasta tres segundos a que llegue un prompt por stdin y luego falla. El
    // prompt siempre se entrega por argv, así que cerramos stdin explícitamente.
    child.stdin?.end();
  });
}

// ---------------------------------------------------------------------------
// Runner de Claude Code (headless, JSON, sin shell, sin Bash tool)
// ---------------------------------------------------------------------------

export function buildClaudeArgs(
  prompt,
  {
    tools,
    allowedTools = POLICY.claude.bothreadCommunicationTools,
    resumeSessionId,
    permissionMode,
  } = {},
) {
  const args = [
    "-p",
    "--output-format",
    "json",
    "--permission-prompts",
    "none",
  ];
  if (permissionMode) args.push("--permission-mode", permissionMode);
  if (resumeSessionId) args.push("--resume", resumeSessionId);
  if (allowedTools) args.push("--allowed-tools", allowedTools);
  if (tools) args.push("--tools", tools);
  args.push("--", prompt);
  return args;
}

function claudeBothreadObservation(parsed) {
  const text = JSON.stringify(parsed ?? {});
  return {
    mcpToolCallObserved:
      text.includes("mcp__bothread__") || text.includes('"join_session"'),
    approvalDenied: /permission_denials?|approval (?:was )?denied/i.test(text),
    unsupported: /unknown tool|not available|unsupported/i.test(text),
  };
}

async function callClaude(
  prompt,
  { tools, resumeSessionId, timeoutMs, permissionMode } = {},
) {
  const args = buildClaudeArgs(prompt, {
    tools,
    allowedTools: POLICY.claude.bothreadCommunicationTools,
    resumeSessionId,
    permissionMode,
  });

  const t0 = Date.now();
  const proc = await runProcess(POLICY.claude.command, args, {
    timeoutMs: timeoutMs ?? POLICY.claude.timeoutMs,
  });
  const durationMs = Date.now() - t0;

  if (proc.code !== 0) {
    const tag = proc.timedOut
      ? `timeout tras ${timeoutMs ?? POLICY.claude.timeoutMs}ms`
      : `exit ${proc.code}`;
    return {
      ok: false,
      error: `claude ${tag}: ${redact(proc.stderr || proc.stdout).slice(0, 2000)}`,
      durationMs,
      bothreadObservation: {
        mcpToolCallObserved: false,
        approvalDenied: /approval.*denied|permission.*denied/i.test(
          proc.stderr || proc.stdout,
        ),
        unsupported: false,
      },
      raw: proc,
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(proc.stdout.trim());
  } catch (e) {
    return {
      ok: false,
      error: `salida de claude no es JSON válido: ${e.message}`,
      durationMs,
      bothreadObservation: {
        mcpToolCallObserved: false,
        approvalDenied: /approval.*denied|permission.*denied/i.test(
          proc.stderr || proc.stdout,
        ),
        unsupported: false,
      },
      raw: proc,
    };
  }

  if (parsed.is_error) {
    return {
      ok: false,
      error: `claude reportó is_error: ${redact(parsed.result ?? "").slice(0, 2000)}`,
      durationMs,
      sessionId: parsed.session_id,
      bothreadObservation: claudeBothreadObservation(parsed),
      raw: parsed,
    };
  }

  return {
    ok: true,
    text: redact(parsed.result ?? ""),
    sessionId: parsed.session_id ?? null,
    costUsd: parsed.total_cost_usd ?? null,
    durationMs,
    bothreadObservation: claudeBothreadObservation(parsed),
  };
}

// ---------------------------------------------------------------------------
// Runner de Codex CLI (headless, JSONL, sin shell). Bothread receives only
// narrowly scoped, per-process tool-approval overrides.
// ---------------------------------------------------------------------------

export function buildCodexArgs(prompt, { sandbox, resumeThreadId } = {}) {
  // `codex exec resume <id>` NO acepta --sandbox ni -C (verificado con
  // `codex exec resume --help`): el sandbox y el cwd son propiedad del
  // thread original, no se repiten al reanudar.
  const commandArgs = resumeThreadId
    ? ["exec", "resume", resumeThreadId, "--json", prompt]
    : ["exec", "--json", "--sandbox", sandbox, "-C", REPO_ROOT, prompt];
  const bothreadTools = POLICY.codex.bothreadCommunicationTools;
  const configArgs = [
    "-c",
    `mcp_servers.bothread.enabled_tools=${JSON.stringify(bothreadTools)}`,
    ...bothreadTools.flatMap((tool) => [
      "-c",
      `mcp_servers.bothread.tools.${tool}.approval_mode=\"auto\"`,
    ]),
  ];
  return [...configArgs, ...commandArgs];
}

function codexBothreadObservation(events) {
  const mcpEvents = events.filter((event) => {
    const type = `${event.type ?? ""} ${event.item?.type ?? ""}`.toLowerCase();
    return type.includes("mcp");
  });
  const text = JSON.stringify(mcpEvents);
  return {
    mcpToolCallObserved:
      text.includes("join_session") || text.includes("mcp__bothread__"),
    approvalDenied:
      /approval.*denied|denied.*approval|permission.*denied/i.test(text),
    unsupported: /unknown tool|not available|unsupported/i.test(text),
  };
}

async function callCodex(prompt, { sandbox, resumeThreadId, timeoutMs } = {}) {
  const args = buildCodexArgs(prompt, { sandbox, resumeThreadId });

  const t0 = Date.now();
  const effectiveTimeout = timeoutMs ?? POLICY.codex.timeoutMs;
  const proc = await runProcess(POLICY.codex.command, args, {
    timeoutMs: effectiveTimeout,
  });
  const durationMs = Date.now() - t0;

  if (proc.code !== 0) {
    const tag = proc.timedOut
      ? `timeout tras ${effectiveTimeout}ms`
      : `exit ${proc.code}`;
    return {
      ok: false,
      error: `codex ${tag}: ${redact(proc.stderr || proc.stdout).slice(0, 2000)}`,
      durationMs,
      bothreadObservation: {
        mcpToolCallObserved: false,
        approvalDenied: /approval.*denied|permission.*denied/i.test(
          proc.stderr || proc.stdout,
        ),
        unsupported: false,
      },
      raw: proc,
    };
  }

  const events = [];
  for (const line of proc.stdout.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      events.push(JSON.parse(t));
    } catch {
      // línea no-JSON suelta (p.ej. "Reading additional input from stdin...");
      // se ignora, no rompe el parseo del resto del stream.
    }
  }

  const threadStarted = events.find((e) => e.type === "thread.started");
  const commands = events
    .filter(
      (e) =>
        e.type === "item.completed" && e.item?.type === "command_execution",
    )
    .map((e) => ({
      command: e.item.command,
      exitCode: e.item.exit_code,
      output: redact(String(e.item.aggregated_output ?? "")).slice(0, 4000),
    }));
  const agentMessages = events
    .filter(
      (e) => e.type === "item.completed" && e.item?.type === "agent_message",
    )
    .map((e) => redact(e.item.text ?? ""));
  const errorEvents = events.filter(
    (e) => typeof e.type === "string" && e.type.includes("error"),
  );

  if (agentMessages.length === 0) {
    return {
      ok: false,
      error: `codex no devolvió ningún agent_message. Eventos de error: ${JSON.stringify(errorEvents).slice(0, 1000)}`,
      durationMs,
      threadId: threadStarted?.thread_id ?? resumeThreadId ?? null,
      bothreadObservation: codexBothreadObservation(events),
      raw: events,
    };
  }

  return {
    ok: true,
    text: agentMessages[agentMessages.length - 1],
    allMessages: agentMessages,
    commands,
    threadId: threadStarted?.thread_id ?? resumeThreadId ?? null,
    durationMs,
    bothreadObservation: codexBothreadObservation(events),
  };
}

// ---------------------------------------------------------------------------
// Cliente Bothread mínimo — JSON-RPC crudo sobre HTTP, sin SDK de MCP.
// La coordinación es obligatoria para una misión de desarrollo, pero Node sigue
// siendo la única autoridad de transiciones.
// ---------------------------------------------------------------------------

class BothreadClient {
  constructor(url) {
    this.url = url;
    this.mcpSessionId = null;
    this.nextId = 1;
    this.joined = false;
  }

  async _rpc(method, params) {
    const res = await fetch(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(this.mcpSessionId ? { "Mcp-Session-Id": this.mcpSessionId } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: this.nextId++,
        method,
        params,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const headerSessionId = res.headers.get("mcp-session-id");
    if (headerSessionId) this.mcpSessionId = headerSessionId;
    const text = await res.text();
    const dataLine = text.split("\n").find((l) => l.startsWith("data: "));
    const payload = JSON.parse(dataLine ? dataLine.slice(6) : text);
    if (payload.error)
      throw new Error(
        `Bothread JSON-RPC error (${method}): ${JSON.stringify(payload.error)}`,
      );
    return payload.result;
  }

  async initialize() {
    return this._rpc("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "orchestrator-v1", version: "0.1.0" },
    });
  }

  async callTool(name, args) {
    const result = await this._rpc("tools/call", { name, arguments: args });
    const text = result?.content?.[0]?.text ?? "";
    if (result?.isError)
      throw new Error(`Bothread tool ${name} devolvió error: ${text}`);
    return text;
  }

  async join(sessionId) {
    await this.initialize();
    await this.callTool("join_session", {
      sessionId,
      agentName: POLICY.bothread.agentName,
      brand: POLICY.bothread.brand,
    });
    this.joined = true;
  }

  async getRoomState(sessionId) {
    return this.callTool("get_room_state", { sessionId });
  }

  async sendMessage(sessionId, text, importance = "info") {
    if (!this.joined) return;
    await this.callTool("send_message", {
      sessionId,
      text: redact(text).slice(0, 7900),
      importance,
    });
  }

  async recordNote(sessionId, kind, title, detail) {
    if (!this.joined) return;
    await this.callTool("record_note", {
      sessionId,
      kind,
      title,
      detail: redact(detail).slice(0, 3900),
    });
  }

  async leave(sessionId) {
    if (!this.joined) return;
    try {
      await this.callTool("leave_session", { sessionId });
    } catch {
      // salir es best-effort; no bloquea el cierre del run
    }
  }
}

function bothreadClient(run) {
  if (!run._bothread) {
    Object.defineProperty(run, "_bothread", {
      value: new BothreadClient(POLICY.bothread.url),
      enumerable: false,
      configurable: true,
    });
  }
  return run._bothread;
}

async function createBothreadRoom(run) {
  const res = await fetch(`${POLICY.bothread.apiUrl}/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `${path.basename(REPO_ROOT)} — ${run.runId}`,
      projectPath: REPO_ROOT,
      settings: {},
    }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.text();
  if (!res.ok)
    throw new Error(
      `Bothread no pudo crear la sala (HTTP ${res.status}): ${body.slice(0, 500)}`,
    );
  const created = JSON.parse(body);
  if (!created?.room?.id || !created?.sessionId)
    throw new Error("Bothread devolvió una sala sin room.id o sessionId");
  run.bothreadRoomId = created.room.id;
  Object.defineProperty(run, "_bothreadSessionId", {
    value: created.sessionId,
    writable: true,
    enumerable: false,
    configurable: true,
  });
  run.bothread ??= newBothreadState();
  run.bothread.roomCreated = true;
  recordStep(run, "bothread_room_created", { roomId: created.room.id });
}

async function bothreadRoomSnapshot(run) {
  if (!run.bothreadRoomId)
    throw new Error("El run no tiene una sala Bothread persistida.");
  const res = await fetch(
    `${POLICY.bothread.apiUrl}/rooms/${run.bothreadRoomId}`,
    {
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!res.ok)
    throw new Error(`Bothread no pudo leer la sala (HTTP ${res.status}).`);
  const body = await res.json();
  if (!body?.sessionId)
    throw new Error("Bothread devolvió una sala sin sessionId.");
  Object.defineProperty(run, "_bothreadSessionId", {
    value: body.sessionId,
    writable: true,
    enumerable: false,
    configurable: true,
  });
  return body;
}

async function bothreadSessionId(run) {
  if (!run._bothreadSessionId) await bothreadRoomSnapshot(run);
  return run._bothreadSessionId;
}

export function assessAgentParticipation(snapshot, agentName) {
  const participants = snapshot?.participants ?? [];
  const thread = snapshot?.snapshot?.thread ?? snapshot?.thread ?? [];
  return {
    joined: participants.some((participant) => participant.name === agentName),
    messagePublished: thread.some((message) => message.author === agentName),
  };
}

function agentBothreadProblem(state, agentName) {
  if (!state.joinRequested) return null;
  if (state.approvalDenied) return `${agentName}: aprobación MCP denegada`;
  if (state.unsupported) return `${agentName}: MCP no compatible`;
  if (!state.mcpToolCallObserved)
    return `${agentName}: no se observó llamada MCP`;
  if (!state.joined) return `${agentName}: join no confirmado`;
  if (!state.messagePublished) return `${agentName}: publicación no confirmada`;
  return null;
}

export function assessBothreadIntegration(claude, codex) {
  const problems = [
    agentBothreadProblem(claude, "Claude"),
    agentBothreadProblem(codex, "Codex"),
  ].filter(Boolean);
  const bothRequested = claude.joinRequested && codex.joinRequested;
  if (problems.length > 0) {
    return { integration: "DEGRADED", degradedReason: problems.join("; ") };
  }
  if (bothRequested) return { integration: "HEALTHY", degradedReason: null };
  return { integration: "PENDING", degradedReason: null };
}

function refreshBothreadIntegration(run) {
  Object.assign(
    run.bothread,
    assessBothreadIntegration(run.bothread.claude, run.bothread.codex),
  );
}

async function recordAgentBothreadParticipation(
  run,
  agent,
  agentName,
  observation,
) {
  try {
    const snapshot = await bothreadRoomSnapshot(run);
    const participation = assessAgentParticipation(snapshot, agentName);
    Object.assign(run.bothread[agent], observation, participation);
    refreshBothreadIntegration(run);
    recordStep(run, "bothread_agent_participation", {
      agent,
      mcpToolCallObserved: run.bothread[agent].mcpToolCallObserved,
      joined: participation.joined,
      messagePublished: participation.messagePublished,
      approvalDenied: run.bothread[agent].approvalDenied,
      unsupported: run.bothread[agent].unsupported,
      integration: run.bothread.integration,
    });
  } catch (error) {
    Object.assign(run.bothread[agent], observation, {
      joined: false,
      messagePublished: false,
    });
    run.bothread.integration = "DEGRADED";
    refreshBothreadIntegration(run);
    run.bothread.degradedReason ??= redact(error.message).slice(0, 300);
    recordStep(run, "bothread_agent_participation", {
      agent,
      mcpToolCallObserved: run.bothread[agent].mcpToolCallObserved,
      joined: false,
      messagePublished: false,
      approvalDenied: run.bothread[agent].approvalDenied,
      unsupported: run.bothread[agent].unsupported,
      integration: "DEGRADED",
      reason: run.bothread.degradedReason,
    });
  }
}

function markAgentBothreadJoinRequested(run, agent) {
  run.bothread ??= newBothreadState();
  run.bothread[agent].joinRequested = true;
  recordStep(run, "bothread_agent_join_requested", { agent });
}

async function prepareBothreadWorkspace(run, { createRoom = false } = {}) {
  if (!POLICY.bothread.requiredForDevelopment) return;
  if (!run.bothreadRoomId) {
    if (!createRoom)
      throw new Error(
        "El run no tiene una sala Bothread persistida; no se creará una segunda sala durante la recuperación.",
      );
    await createBothreadRoom(run);
  }
  const client = bothreadClient(run);
  if (!client.joined) {
    const sessionId = await bothreadSessionId(run);
    await client.join(sessionId);
    await client.getRoomState(sessionId);
    run.bothread ??= newBothreadState();
    run.bothread.orchestratorJoined = true;
    recordStep(run, "bothread_joined", { roomId: run.bothreadRoomId ?? null });
  }
}

async function startBothreadWorkspace(run) {
  await prepareBothreadWorkspace(run, { createRoom: true });
  const client = bothreadClient(run);
  const sessionId = await bothreadSessionId(run);
  await client.sendMessage(
    sessionId,
    `Orchestrator: misión iniciada para ${run.runId}.\n\nTarea de Dani:\n${redact(run.task).slice(0, 6000)}`,
    "steering",
  );
  await client.recordNote(
    sessionId,
    "decision",
    `Misión iniciada: ${run.runId}`,
    redact(run.task).slice(0, 3900),
  );
  recordStep(run, "bothread_mission_started", { roomId: run.bothreadRoomId });
}

async function bothreadNotify(run, text, { importance = "info", note } = {}) {
  if (!run.bothreadRoomId)
    throw new Error(
      "Bothread es obligatorio para desarrollo, pero este run no tiene una sala configurada.",
    );
  try {
    await prepareBothreadWorkspace(run);
    const client = bothreadClient(run);
    const sessionId = await bothreadSessionId(run);
    await client.sendMessage(sessionId, text, importance);
    if (note)
      await client.recordNote(sessionId, note.kind, note.title, note.detail);
  } catch (e) {
    log(`[bothread] fallo obligatorio: ${e.message}`);
    recordStep(run, "bothread_warning", { message: redact(e.message) });
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Validación determinista, ejecutada por el orquestador (nunca por el LLM)
// ---------------------------------------------------------------------------

async function gitStatusShort() {
  const r = await runProcess("git", ["status", "--short"], {
    timeoutMs: 30000,
  });
  return r.stdout.trim();
}

async function gitDiff() {
  const r = await runProcess("git", ["diff"], { timeoutMs: 30000 });
  return r.stdout;
}

async function gitChangedPaths() {
  const r = await runProcess("git", ["diff", "--name-only"], {
    timeoutMs: 30000,
  });
  return r.stdout.split("\n").filter(Boolean);
}

function statusPath(line) {
  return line.slice(3).trim().split(" -> ").at(-1);
}

function isApprovedBothreadRuntimePath(filePath) {
  return filePath === ".bothread/" || filePath.startsWith(".bothread/");
}

export function readOnlyWorktreeChanges(baseline, status, diff, diffPaths) {
  const baselineStatus = new Set(
    (baseline.status ?? "")
      .split("\n")
      .filter(Boolean)
      .filter((line) => !isApprovedBothreadRuntimePath(statusPath(line))),
  );
  const currentStatus = status
    .split("\n")
    .filter(Boolean)
    .filter((line) => !isApprovedBothreadRuntimePath(statusPath(line)));
  const changedStatus = currentStatus.filter(
    (line) => !baselineStatus.has(line),
  );
  const changedDiff =
    diff === baseline.diff
      ? []
      : diffPaths.filter(
          (filePath) => !isApprovedBothreadRuntimePath(filePath),
        );
  return [...new Set([...changedStatus.map(statusPath), ...changedDiff])];
}

async function enforceReadOnlyBaseline(run, phase) {
  if (run.mode !== "READ_ONLY_AUDIT") return;
  const status = await gitStatusShort();
  const diff = await gitDiff();
  const changedPaths = readOnlyWorktreeChanges(
    run.baseline,
    status,
    diff,
    await gitChangedPaths(),
  );
  recordStep(run, "read_only_worktree_check", {
    phase,
    clean: changedPaths.length === 0,
    changedPaths,
  });
  if (changedPaths.length > 0) {
    throw new Error(
      `READ_ONLY_AUDIT detectó cambios no autorizados después de ${phase}: ${changedPaths.join(", ")}. No se revirtió ningún archivo.`,
    );
  }
}

async function runValidation() {
  const results = {};
  for (const [key, cmd] of Object.entries({
    typeCheck: POLICY.validation.typeCheckCommand,
    formatCheck: POLICY.validation.formatCheckCommand,
  })) {
    const [bin, ...args] = cmd;
    const r = await runProcess(bin, args, { timeoutMs: 300000 });
    results[key] = {
      passed: r.code === 0,
      exitCode: r.code,
      output: redact(r.stdout + r.stderr).slice(-4000),
    };
  }
  return results;
}

// ---------------------------------------------------------------------------
// Parseo estricto del veredicto de Codex — nunca se infiere del tono
// ---------------------------------------------------------------------------

function parseVerdict(text) {
  const accepted = text.includes(POLICY.verdictMarkers.accepted);
  const changesRequested = text.includes(
    POLICY.verdictMarkers.changesRequested,
  );
  if (accepted && !changesRequested) return "ACCEPTED";
  if (changesRequested && !accepted) return "CHANGES_REQUESTED";
  return null; // ausente, o ambos presentes (ambiguo) -> inválido a propósito
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const SECRET_WARNING =
  "Nunca imprimas, repitas ni incluyas en tu respuesta el contenido de .env.local ni ningún valor de API key, token o credencial.";

function claudeBothreadInstructions(sessionId, phase) {
  return [
    `Bothread es obligatorio en esta misión. Sala: ${sessionId}. Tu rol en esta fase: ${phase}.`,
    'Usa mcp__bothread__join_session con agentName "Claude" y brand "claude", luego mcp__bothread__get_room_state y mcp__bothread__send_message. Tu participación se verifica desde la sala; no afirmes que te uniste si una llamada falló.',
  ];
}

function claudeAnalysisPrompt(task, bothreadSessionId, mode) {
  return [
    "Eres un participante de un flujo automatizado de dos agentes (Claude + Codex) orquestado por un script Node, trabajando sobre el repositorio en el directorio actual.",
    "Este es un paso de ANÁLISIS INDEPENDIENTE y de solo lectura — no tienes herramientas de escritura en este turno (no puedes editar nada).",
    "",
    `Tarea encargada por Dani (dueño del proyecto): "${task}"`,
    "",
    ...claudeBothreadInstructions(bothreadSessionId, "análisis independiente"),
    "Inspecciona solo los archivos necesarios para responder a esta tarea; no hagas una inspección de todo el repositorio ni cargues documentación no relacionada.",
    "Escribe un análisis técnico conciso: qué hay que cambiar, por qué, qué archivos probablemente estén implicados, riesgos, y cualquier cosa ambigua que debería decidir un humano.",
    "Debes publicar en Bothread los hallazgos y riesgos útiles de tu análisis.",
    "",
    mode === "READ_ONLY_AUDIT"
      ? "Esta es una auditoría formal de solo lectura: no implementes, no ejecutes validaciones, tests, builds, instalaciones ni arranques la aplicación."
      : "No implementes nada. No ejecutes comandos destructivos. Esto es solo análisis.",
    SECRET_WARNING,
  ].join("\n");
}

function codexAnalysisPrompt(task, bothreadSessionId, mode) {
  return [
    "Eres un participante de un flujo automatizado de dos agentes (Claude + Codex) orquestado por un script Node, trabajando sobre el repositorio en el directorio actual.",
    "Este es un paso de ANÁLISIS INDEPENDIENTE. Estás en sandbox read-only: no puedes escribir nada aunque lo intentaras.",
    `Bothread es obligatorio. Usa el servidor MCP Bothread ya configurado: únete con join_session usando la sala ${bothreadSessionId}, agentName "Codex" y brand "codex"; llama get_room_state y publica tu análisis con send_message. Tu participación se verifica desde la sala.`,
    "",
    `Tarea encargada por Dani (dueño del proyecto): "${task}"`,
    "",
    "Inspecciona solo los archivos necesarios para responder a esta tarea; no hagas una inspección de todo el repositorio ni cargues documentación no relacionada.",
    "Escribe un análisis técnico conciso e independiente (no has visto el análisis de Claude): qué hay que cambiar, por qué, archivos probablemente implicados, riesgos.",
    mode === "READ_ONLY_AUDIT"
      ? "Esta es una auditoría formal de solo lectura: no implementes, no ejecutes validaciones, tests, builds, instalaciones ni arranques la aplicación."
      : "",
    SECRET_WARNING,
  ].join("\n");
}

function synthesisPrompt(
  task,
  claudeAnalysis,
  codexAnalysis,
  bothreadSessionId,
  mode,
) {
  return [
    "Sigues en modo de solo lectura (sin herramientas de escritura). Ahora tienes DOS análisis independientes de la misma tarea: el tuyo propio y el de Codex, un agente distinto que la analizó sin ver el tuyo.",
    "",
    `Tarea original: "${task}"`,
    "",
    ...claudeBothreadInstructions(bothreadSessionId, "síntesis y plan"),
    "--- Tu análisis (Claude) ---",
    claudeAnalysis,
    "",
    "--- Análisis de Codex ---",
    codexAnalysis,
    "",
    mode === "READ_ONLY_AUDIT"
      ? "Produce un INFORME DE AUDITORÍA sintetizado: hallazgos, evidencia, riesgos, decisiones que necesita Dani y posibles siguientes pasos. No propongas que se implemente ahora, no ejecutes validaciones y publica el informe en Bothread con send_message; registra una decisión relevante con record_note."
      : "Produce una SÍNTESIS técnica: en qué coincidís, en qué discrepáis (si acaso), y UN plan de implementación concreto y acordado — el que se va a implementar literalmente a continuación, así que sé específico sobre archivos y cambios. Publica el plan en Bothread y registra una decisión relevante con record_note.",
    SECRET_WARNING,
  ].join("\n");
}

function implementationPrompt(task, plan, bothreadSessionId) {
  return [
    "Ahora SÍ tienes herramientas de escritura (Read, Edit, Write, Grep, Glob) pero NO tienes Bash: no puedes ejecutar git, npm, ni ningún comando de shell bajo ningún concepto en este turno — es una restricción técnica del proceso, no una petición.",
    "Por eso NUNCA vas a poder hacer git commit, git push, una migración ni ninguna acción destructiva: literalmente no tienes la herramienta para intentarlo.",
    "",
    `Tarea original: "${task}"`,
    "",
    ...claudeBothreadInstructions(bothreadSessionId, "implementación"),
    "Before editing, read the shared room context. Publish an implementation summary when finished; file claims are intentionally unavailable in this non-interactive controller.",
    "--- Plan acordado a implementar ---",
    plan,
    "",
    'Antes de tocar nada, lee CLAUDE.md y respeta sus reglas (incluida la sección "Qué no tocar": components/trainer/calendar/*, components/booking/* y lib/dateUtils.ts no se tocan sin preguntar antes — si el plan lo requiriera, implementa lo demás y dilo explícitamente en tu resumen final en vez de tocarlos).',
    "Implementa EXACTAMENTE el plan de arriba. Cambio mínimo, sin scope creep, sin refactors no pedidos.",
    "Al terminar, tu último mensaje debe ser un resumen claro: qué archivos cambiaste y por qué, en qué te desviaste del plan si acaso y por qué, y cualquier cosa que no pudiste verificar tú mismo (no tienes Bash para correr type-check; eso lo hace el orquestador después).",
    SECRET_WARNING,
  ].join("\n");
}

function codexReviewPrompt(
  task,
  plan,
  validationSummary,
  iteration,
  maxIterations,
  bothreadSessionId,
) {
  return [
    `Eres el revisor de código de este flujo. Ronda de revisión ${iteration} de máximo ${maxIterations}.`,
    "Estás en sandbox read-only pero SÍ puedes ejecutar comandos de solo lectura (git diff, git status, cat, grep, etc.) para inspeccionar el estado real del repositorio — hazlo, no confíes solo en lo que se te cuenta aquí.",
    "",
    `Tarea original: "${task}"`,
    "",
    `Bothread es obligatorio. Usa el servidor MCP Bothread ya configurado: únete con join_session usando la sala ${bothreadSessionId}, agentName "Codex" y brand "codex"; llama get_room_state y publica tu revisión/veredicto con send_message. Tu participación se verifica desde la sala.`,
    "",
    "--- Plan que se suponía que se iba a implementar ---",
    plan,
    "",
    "--- Resultado de las comprobaciones automáticas ya ejecutadas por el orquestador ---",
    validationSummary,
    "",
    "Revisa el diff real contra el plan y contra las reglas de CLAUDE.md (léelo si no lo has leído ya en esta sesión). Busca: correctitud, que no se haya salido del alcance del plan, que no se hayan tocado archivos protegidos sin motivo, y cualquier bug real.",
    "",
    "Termina tu respuesta con EXACTAMENTE una de estas dos líneas, y nada más en esa línea (es un marcador que un script va a parsear literalmente, no lo parafrasees ni lo decores):",
    "  ORCHESTRATOR_VERDICT: ACCEPTED",
    "  ORCHESTRATOR_VERDICT: CHANGES_REQUESTED",
    "Si es CHANGES_REQUESTED, antes de esa línea final incluye una lista numerada, concreta y accionable de lo que hay que corregir — eso es lo único que se le va a pasar a Claude para que lo arregle.",
    SECRET_WARNING,
  ].join("\n");
}

function verdictFormatReminderPrompt() {
  return [
    "Tu respuesta anterior no incluyó el marcador exacto exigido. Repite tu veredicto.",
    "Tu respuesta tiene que terminar con EXACTAMENTE una de estas dos líneas, tal cual, sin decorarla ni parafrasearla:",
    "  ORCHESTRATOR_VERDICT: ACCEPTED",
    "  ORCHESTRATOR_VERDICT: CHANGES_REQUESTED",
  ].join("\n");
}

function claudeFixPrompt(codexReviewText, bothreadSessionId) {
  return [
    "Codex ha revisado tu implementación y ha pedido cambios. Sigues sin Bash — solo Read, Edit, Write, Grep, Glob.",
    "",
    ...claudeBothreadInstructions(
      bothreadSessionId,
      "corrección solicitada por Codex",
    ),
    "Lee en Bothread el feedback relayed de Codex y publica el resumen de la corrección al terminar; file claims are intentionally unavailable in this non-interactive controller.",
    "--- Revisión de Codex (texto exacto) ---",
    codexReviewText,
    "",
    "Corrige ÚNICAMENTE lo que Codex ha pedido ahí arriba. No aproveches para tocar nada más, no hagas refactors adicionales.",
    "Termina con un resumen de qué corregiste, punto por punto contra lo que pidió Codex.",
    SECRET_WARNING,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Pasos del flujo — cada uno hace UNA cosa, guarda su resultado en el run, y
// deja que el bucle principal decida la transición.
// ---------------------------------------------------------------------------

async function stepClaudeAnalysis(run) {
  await bothreadNotify(
    run,
    `Orchestrator: empezando análisis independiente — "${run.task}"`,
  );
  const sessionId = await bothreadSessionId(run);
  markAgentBothreadJoinRequested(run, "claude");
  const res = await callClaude(
    claudeAnalysisPrompt(run.task, sessionId, run.mode),
    {
      tools: POLICY.claude.analysisTools,
    },
  );
  recordStep(run, "claude_analysis", {
    ok: res.ok,
    text: res.text,
    sessionId: res.sessionId,
    costUsd: res.costUsd,
    durationMs: res.durationMs,
    error: res.error,
  });
  await recordAgentBothreadParticipation(
    run,
    "claude",
    "Claude",
    res.bothreadObservation,
  );
  await enforceReadOnlyBaseline(run, "CLAUDE_ANALYSIS");
  if (!res.ok) return fail(run, res.error);
  transition(run, "CODEX_ANALYSIS", "análisis de Claude completo");
}

async function stepCodexAnalysis(run) {
  const sessionId = await bothreadSessionId(run);
  markAgentBothreadJoinRequested(run, "codex");
  const res = await callCodex(
    codexAnalysisPrompt(run.task, sessionId, run.mode),
    {
      sandbox: POLICY.codex.analysisSandbox,
    },
  );
  if (res.ok) run.codexThreadId = res.threadId ?? run.codexThreadId;
  recordStep(run, "codex_analysis", {
    ok: res.ok,
    text: res.text,
    threadId: res.threadId,
    commands: res.commands,
    durationMs: res.durationMs,
    error: res.error,
  });
  await recordAgentBothreadParticipation(
    run,
    "codex",
    "Codex",
    res.bothreadObservation,
  );
  await enforceReadOnlyBaseline(run, "CODEX_ANALYSIS");
  if (!res.ok) return fail(run, res.error);
  await bothreadNotify(
    run,
    `Orchestrator: análisis de Codex recibido (thread ${res.threadId}).\n\n--- Análisis de Codex (resumen acotado) ---\n${res.text.slice(0, 6000)}`,
    {
      note: {
        kind: "decision",
        title: `Análisis de Codex: ${run.runId}`,
        detail: res.text.slice(0, 3900),
      },
    },
  );
  transition(run, "SYNTHESIS", "análisis de Codex recibido y relayado");
}

async function stepSynthesis(run) {
  const claudeText = lastStep(run, "claude_analysis").text;
  const codexText = lastStep(run, "codex_analysis").text;
  const sessionId = await bothreadSessionId(run);
  markAgentBothreadJoinRequested(run, "claude");
  const res = await callClaude(
    synthesisPrompt(run.task, claudeText, codexText, sessionId, run.mode),
    { tools: POLICY.claude.analysisTools },
  );
  recordStep(run, "synthesis", {
    ok: res.ok,
    text: res.text,
    sessionId: res.sessionId,
    costUsd: res.costUsd,
    durationMs: res.durationMs,
    error: res.error,
  });
  await recordAgentBothreadParticipation(
    run,
    "claude",
    "Claude",
    res.bothreadObservation,
  );
  await enforceReadOnlyBaseline(run, "SYNTHESIS");
  if (!res.ok) return fail(run, res.error);
  await bothreadNotify(
    run,
    `Orchestrator: síntesis/plan acordado —\n\n${res.text.slice(0, 6000)}`,
    {
      note: {
        kind: "decision",
        title: `Plan acordado: ${run.task}`.slice(0, 200),
        detail: res.text,
      },
    },
  );
  if (nextStateAfterSynthesis(run.mode) === "WAITING_FOR_DANI") {
    await publishAuditWaitingForDani(run);
    return transition(run, "WAITING_FOR_DANI", "auditoría sintetizada");
  }
  transition(run, "IMPLEMENTATION", "plan sintetizado");
}

async function stepImplementation(run) {
  const plan = lastStep(run, "synthesis").text;
  // Se persiste antes de invocar a Claude: si el proceso o el Mac cae mientras
  // Claude escribe, reanudar automáticamente sería ambiguo y potencialmente
  // repetiría una modificación con efectos laterales.
  recordStep(run, "claude_mutation_started", { phase: "implementation" });
  await bothreadNotify(
    run,
    "Orchestrator: implementando el plan acordado (Claude, sin Bash, sin git commit/push posible).",
  );
  const sessionId = await bothreadSessionId(run);
  markAgentBothreadJoinRequested(run, "claude");
  const res = await callClaude(
    implementationPrompt(run.task, plan, sessionId),
    {
      tools: POLICY.claude.implementationTools,
      permissionMode: "acceptEdits",
    },
  );
  recordStep(run, "implementation", {
    ok: res.ok,
    text: res.text,
    sessionId: res.sessionId,
    costUsd: res.costUsd,
    durationMs: res.durationMs,
    error: res.error,
  });
  await recordAgentBothreadParticipation(
    run,
    "claude",
    "Claude",
    res.bothreadObservation,
  );
  if (!res.ok) return fail(run, res.error);
  run.claudeSessionId = res.sessionId;

  const diff = await gitDiff();
  const status = await gitStatusShort();
  const validation = await runValidation();
  recordStep(run, "post_implementation_check", {
    diff: redact(diff),
    status: redact(status),
    validation,
  });
  await bothreadNotify(
    run,
    `Orchestrator: validación tras implementación.\n\n${validationSummaryText(validation).slice(0, 6000)}`,
    {
      note: {
        kind: "verification",
        title: `Validación tras implementación: ${run.runId}`,
        detail: validationSummaryText(validation).slice(0, 3900),
      },
    },
  );

  const changedSinceStart =
    diff !== run.baseline.diff || status !== run.baseline.status;
  if (!changedSinceStart) {
    return fail(
      run,
      new Error(
        "Claude terminó la implementación sin dejar ningún cambio en el árbol de trabajo — resultado inesperado, no se puede continuar a revisión.",
      ),
    );
  }

  transition(run, "CODEX_REVIEW", "implementación lista, entrando a revisión");
}

function validationSummaryText(validation) {
  return Object.entries(validation)
    .map(
      ([k, v]) =>
        `${k}: ${v.passed ? "PASSED" : `FAILED (exit ${v.exitCode})`}\n${v.output.slice(-1500)}`,
    )
    .join("\n\n");
}

function bothreadSummary(run) {
  const state = run.bothread ?? newBothreadState();
  return [
    `Room created: ${state.roomCreated ? "yes" : "no"}`,
    `Orchestrator joined: ${state.orchestratorJoined ? "yes" : "no"}`,
    `Claude: join requested ${state.claude.joinRequested ? "yes" : "no"}, MCP observed ${state.claude.mcpToolCallObserved ? "yes" : "no"}, joined ${state.claude.joined ? "yes" : "no"}, published ${state.claude.messagePublished ? "yes" : "no"}, approval denied ${state.claude.approvalDenied ? "yes" : "no"}, unsupported ${state.claude.unsupported ? "yes" : "no"}`,
    `Codex: join requested ${state.codex.joinRequested ? "yes" : "no"}, MCP observed ${state.codex.mcpToolCallObserved ? "yes" : "no"}, joined ${state.codex.joined ? "yes" : "no"}, published ${state.codex.messagePublished ? "yes" : "no"}, approval denied ${state.codex.approvalDenied ? "yes" : "no"}, unsupported ${state.codex.unsupported ? "yes" : "no"}`,
    `Integration: ${state.integration}${state.degradedReason ? ` (${state.degradedReason})` : ""}`,
  ].join("\n");
}

async function publishAuditWaitingForDani(run) {
  const synthesis = lastStep(run, "synthesis").text;
  const worktree = lastStep(run, "read_only_worktree_check");
  await bothreadNotify(
    run,
    `Orchestrator: estado final WAITING_FOR_DANI para READ_ONLY_AUDIT. Claude y Codex completaron análisis; Dani debe aprobar cualquier siguiente acción.\n\nWorktree limpio: ${worktree.clean ? "sí" : "no"}\n\n--- Informe de auditoría sintetizado ---\n${synthesis.slice(0, 5000)}\n\n--- Estado real de Bothread ---\n${bothreadSummary(run)}`,
    {
      importance: "steering",
      note: {
        kind: "verification",
        title: "Auditoría finalizada: WAITING_FOR_DANI",
        detail: `Worktree limpio: ${worktree.clean ? "sí" : "no"}.\n\n${bothreadSummary(run)}`,
      },
    },
  );
}

async function publishWaitingForDani(run) {
  const review = lastStep(run, "codex_review");
  const check = lastStep(run, "post_implementation_check", "claude_fix_check");
  await bothreadNotify(
    run,
    `Orchestrator: estado final WAITING_FOR_DANI; revisión ${run.reviewIteration}; veredicto ${review.verdict}. Dani debe aprobar cualquier siguiente acción.\n\nCambios:\n${check.status.slice(0, 1200) || "(sin cambios)"}\n\nValidación:\n${validationSummaryText(check.validation).slice(0, 1400)}`,
    {
      importance: "steering",
      note: {
        kind: "verification",
        title: "Run finalizado: WAITING_FOR_DANI",
        detail: `Revisión: ${run.reviewIteration}. Veredicto Codex: ${review.verdict}. Dani debe aprobar cualquier siguiente acción.\n\nCambios:\n${check.status.slice(0, 1200) || "(sin cambios)"}`,
      },
    },
  );
}

async function stepCodexReview(run) {
  run.reviewIteration += 1;
  if (run.reviewIteration > POLICY.maxReviewIterations) {
    recordStep(run, "review_limit_reached", {
      reviewIteration: run.reviewIteration,
    });
    await bothreadNotify(
      run,
      `Orchestrator: se alcanzó el máximo de ${POLICY.maxReviewIterations} rondas de revisión sin ACCEPTED. Escalando a Dani.`,
      { importance: "interrupt" },
    );
    return transition(
      run,
      "ESCALATED_TO_DANI",
      `${POLICY.maxReviewIterations} rondas sin ACCEPTED`,
    );
  }

  const plan = lastStep(run, "synthesis").text;
  const validation = lastStep(
    run,
    "post_implementation_check",
    "claude_fix_check",
  ).validation;
  const prompt = codexReviewPrompt(
    run.task,
    plan,
    validationSummaryText(validation),
    run.reviewIteration,
    POLICY.maxReviewIterations,
    await bothreadSessionId(run),
  );

  markAgentBothreadJoinRequested(run, "codex");
  let res = await callCodex(prompt, {
    sandbox: POLICY.codex.reviewSandbox,
    resumeThreadId: run.codexThreadId,
  });
  await recordAgentBothreadParticipation(
    run,
    "codex",
    "Codex",
    res.bothreadObservation,
  );
  if (!res.ok) return fail(run, res.error);
  run.codexThreadId = res.threadId;

  let verdict = parseVerdict(res.text);
  let formatRetries = 0;
  while (verdict === null && formatRetries < POLICY.maxVerdictFormatRetries) {
    formatRetries += 1;
    recordStep(run, "codex_review_format_retry", {
      iteration: run.reviewIteration,
      attempt: formatRetries,
      rawText: res.text,
    });
    res = await callCodex(verdictFormatReminderPrompt(), {
      sandbox: POLICY.codex.reviewSandbox,
      resumeThreadId: run.codexThreadId,
    });
    if (!res.ok) return fail(run, res.error);
    verdict = parseVerdict(res.text);
  }

  recordStep(run, "codex_review", {
    iteration: run.reviewIteration,
    ok: res.ok,
    text: res.text,
    threadId: res.threadId,
    verdict,
    durationMs: res.durationMs,
  });

  if (verdict === null) {
    return fail(
      run,
      new Error(
        `Codex no devolvió un veredicto válido tras ${formatRetries} reintento(s) de formato. Texto: ${res.text.slice(0, 1000)}`,
      ),
    );
  }

  await bothreadNotify(
    run,
    `Orchestrator: revisión de Codex #${run.reviewIteration} — veredicto ${verdict}.\n\n${res.text.slice(0, 6000)}`,
    {
      note: {
        kind: verdict === "ACCEPTED" ? "verification" : "issue",
        title: `Revisión Codex #${run.reviewIteration}: ${verdict}`,
        detail: res.text.slice(0, 3900),
      },
    },
  );

  if (verdict === "ACCEPTED") {
    // Bothread is required in development mode. Publish the final workspace
    // record before making the human-handoff state durable, so an unavailable
    // workspace cannot leave a run apparently ready for Dani.
    await publishWaitingForDani(run);
    return transition(
      run,
      "WAITING_FOR_DANI",
      `revisión #${run.reviewIteration} aceptada`,
    );
  }
  transition(
    run,
    "CLAUDE_FIX",
    `revisión #${run.reviewIteration} pide cambios`,
  );
}

async function stepClaudeFix(run) {
  const review = lastStep(run, "codex_review");
  recordStep(run, "claude_mutation_started", { phase: "claude_fix" });
  const sessionId = await bothreadSessionId(run);
  markAgentBothreadJoinRequested(run, "claude");
  const res = await callClaude(claudeFixPrompt(review.text, sessionId), {
    tools: POLICY.claude.implementationTools,
    resumeSessionId: run.claudeSessionId,
    permissionMode: "acceptEdits",
  });
  recordStep(run, "claude_fix", {
    iteration: run.reviewIteration,
    ok: res.ok,
    text: res.text,
    sessionId: res.sessionId,
    costUsd: res.costUsd,
    durationMs: res.durationMs,
    error: res.error,
  });
  await recordAgentBothreadParticipation(
    run,
    "claude",
    "Claude",
    res.bothreadObservation,
  );
  if (!res.ok) return fail(run, res.error);
  run.claudeSessionId = res.sessionId ?? run.claudeSessionId;

  const diff = await gitDiff();
  const status = await gitStatusShort();
  const validation = await runValidation();
  recordStep(run, "claude_fix_check", {
    diff: redact(diff),
    status: redact(status),
    validation,
  });
  await bothreadNotify(
    run,
    `Orchestrator: validación tras fix #${run.reviewIteration}.\n\n${validationSummaryText(validation).slice(0, 6000)}`,
  );

  await bothreadNotify(
    run,
    `Orchestrator: fix #${run.reviewIteration} aplicado por Claude —\n\n${res.text.slice(0, 6000)}`,
  );
  transition(
    run,
    "CODEX_REVIEW",
    `fix #${run.reviewIteration} listo, volviendo a revisión`,
  );
}

// ---------------------------------------------------------------------------
// Helpers de lectura del historial
// ---------------------------------------------------------------------------

function lastStep(run, ...kinds) {
  for (let i = run.history.length - 1; i >= 0; i--) {
    if (kinds.includes(run.history[i].kind)) return run.history[i];
  }
  throw new Error(
    `No hay ningún paso de tipo ${kinds.join("/")} en el historial de ${run.runId}`,
  );
}

// ---------------------------------------------------------------------------
// Bucle principal — un switch explícito, sin magia
// ---------------------------------------------------------------------------

const STEP_HANDLERS = {
  RECEIVED: async (run) => transition(run, "CLAUDE_ANALYSIS", "run recibido"),
  CLAUDE_ANALYSIS: stepClaudeAnalysis,
  CODEX_ANALYSIS: stepCodexAnalysis,
  SYNTHESIS: stepSynthesis,
  IMPLEMENTATION: stepImplementation,
  CODEX_REVIEW: stepCodexReview,
  CLAUDE_FIX: stepClaudeFix,
};

const TERMINAL_STATES = new Set([
  "WAITING_FOR_DANI",
  "ESCALATED_TO_DANI",
  "FAILED",
]);

function hasAmbiguousClaudeMutation(run) {
  const started = [...run.history]
    .reverse()
    .find((entry) => entry.kind === "claude_mutation_started");
  if (!started) return false;
  const completedKind =
    started.phase === "implementation" ? "implementation" : "claude_fix";
  const startedIndex = run.history.indexOf(started);
  return !run.history
    .slice(startedIndex + 1)
    .some((entry) => entry.kind === completedKind);
}

async function runOrchestration(run) {
  while (!TERMINAL_STATES.has(run.status)) {
    const handler = STEP_HANDLERS[run.status];
    if (!handler)
      return fail(run, new Error(`Estado sin handler: ${run.status}`));
    try {
      await handler(run);
    } catch (e) {
      fail(run, e);
    }
  }
  await printFinalReport(run);
  if (run._bothread) await run._bothread.leave(await bothreadSessionId(run));
}

// ---------------------------------------------------------------------------
// Informe final para Dani
// ---------------------------------------------------------------------------

async function printFinalReport(run) {
  const diff = await gitDiff();
  const status = await gitStatusShort();
  const isAudit = run.mode === "READ_ONLY_AUDIT";
  const synthesis = run.history.find((h) => h.kind === "synthesis");
  const worktreeCheck = run.history
    .filter((h) => h.kind === "read_only_worktree_check")
    .at(-1);
  const lastReview = run.history
    .filter((h) => h.kind === "codex_review")
    .at(-1);
  const fixes = run.history.filter((h) => h.kind === "claude_fix");
  const unverified = isAudit
    ? [
        "Auditoría de solo lectura: no se ejecutaron implementación, revisión de código, fixes, type-check, format-check, tests, builds ni aplicación.",
        "El orquestador no ha hecho commit, push, deploy, migraciones ni tocado credenciales — eso lo decide Dani.",
      ]
    : [
        "No se ha ejecutado en navegador ni contra una app en marcha — solo análisis estático + type-check + format:check.",
        "El orquestador no ha hecho commit, push, deploy, migraciones ni tocado credenciales — eso lo decide Dani.",
      ];

  const lines = [
    "=".repeat(70),
    `INFORME FINAL — ${run.runId}`,
    "=".repeat(70),
    `Tarea: ${run.task}`,
    `Modo: ${run.mode ?? "IMPLEMENTATION"}`,
    `Estado final: ${run.status}`,
    `Sala Bothread: ${run.bothreadRoomId ? "present" : "none"}`,
    "--- Estado de participación Bothread ---",
    bothreadSummary(run),
    "",
    "--- git status --short ---",
    status || "(sin cambios)",
    "",
    "--- git diff (resumen: primeras 4000 chars) ---",
    diff ? diff.slice(0, 4000) : "(sin diff)",
    "",
    isAudit
      ? "--- Informe de auditoría sintetizado ---"
      : "--- Comprobaciones ejecutadas por el orquestador ---",
    isAudit
      ? (synthesis?.text ?? "(síntesis no disponible)")
      : JSON.stringify(
          fixes.at(-1)?.validation ??
            run.history.find((h) => h.kind === "post_implementation_check")
              ?.validation ??
            {},
          null,
          2,
        ),
    isAudit
      ? `Worktree permaneció limpio: ${worktreeCheck?.clean ? "sí" : "no"}`
      : `--- Fixes aplicados (${fixes.length}) ---`,
    isAudit
      ? `Claude completó análisis: ${run.history.find((h) => h.kind === "claude_analysis")?.ok ? "sí" : "no"}; Codex completó análisis: ${run.history.find((h) => h.kind === "codex_analysis")?.ok ? "sí" : "no"}`
      : fixes
          .map((f) => `  #${f.iteration}: ${f.text.slice(0, 200)}...`)
          .join("\n") || "  (ninguno, aceptado a la primera)",
    "",
    "--- Qué falta por verificar / qué tiene que aprobar Dani ---",
    unverified.map((u) => `  - ${u}`).join("\n"),
    run.status === "ESCALATED_TO_DANI"
      ? `  - Feedback de Codex sin resolver tras ${POLICY.maxReviewIterations} rondas: ver runs/${run.runId}.json`
      : "",
    run.status === "FAILED" ? `  - FALLO: ${run.lastError}` : "",
    "",
    `Estado completo, historial y todos los textos capturados en: orchestrator/runs/${run.runId}.json`,
    "=".repeat(70),
  ];
  const report = lines.filter((l) => l !== "").join("\n");
  process.stdout.write(report + "\n");
  if (run.status === "WAITING_FOR_DANI") return;
  await bothreadNotify(
    run,
    `Orchestrator: run ${run.runId} terminado en estado ${run.status}; revisión ${run.reviewIteration}; veredicto ${lastReview?.verdict ?? "n/a"}. Dani debe aprobar cualquier siguiente acción.\n\nCambios:\n${status.slice(0, 1200) || "(sin cambios)"}\n\nValidación:\n${JSON.stringify(fixes.at(-1)?.validation ?? run.history.find((h) => h.kind === "post_implementation_check")?.validation ?? {}).slice(0, 1400)}`,
    {
      importance: run.status === "WAITING_FOR_DANI" ? "steering" : "interrupt",
      note: {
        kind: run.status === "WAITING_FOR_DANI" ? "verification" : "issue",
        title: `Run finalizado: ${run.status}`,
        detail: `Revisión: ${run.reviewIteration}. Veredicto Codex: ${lastReview?.verdict ?? "n/a"}. Dani debe aprobar cualquier siguiente acción.\n\nCambios:\n${status.slice(0, 1200) || "(sin cambios)"}`,
      },
    },
  );
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function printUsage() {
  process.stdout.write(
    [
      "Usage:",
      '  New mission: node orchestrator/orchestrate-v1.mjs "TASK"',
      '  Audit:       node orchestrator/orchestrate-v1.mjs --mode READ_ONLY_AUDIT "MISSION"',
      "  Resume:      node orchestrator/orchestrate-v1.mjs --resume RUN_ID",
      "  Help:        node orchestrator/orchestrate-v1.mjs --help",
    ].join("\n") + "\n",
  );
}

function parseArgs(argv) {
  const args = {
    task: null,
    resume: null,
    mode: "IMPLEMENTATION",
    help: false,
  };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--help" || argv[i] === "-h") args.help = true;
    else if (argv[i] === "--resume") args.resume = argv[++i];
    else if (argv[i] === "--mode") args.mode = argv[++i];
    else rest.push(argv[i]);
  }
  args.task = rest.join(" ").trim() || null;
  if (!MISSION_MODES.has(args.mode))
    throw new Error(`Modo no válido: ${args.mode}`);
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  let run;
  let isNewRun = false;
  if (args.resume) {
    run = loadRun(args.resume);
    run.mode = normalizeMissionMode(run.mode);
    run.bothread ??= newBothreadState();
    log(`Reanudando ${run.runId} desde estado ${run.status}`);
    if (TERMINAL_STATES.has(run.status)) {
      log(
        `El run ya está en estado terminal (${run.status}). Nada que reanudar.`,
      );
      await printFinalReport(run);
      return;
    }
    if (hasAmbiguousClaudeMutation(run)) {
      fail(
        run,
        new Error(
          "Recuperación ambigua: el proceso se interrumpió después de iniciar una modificación de Claude. Revisa el árbol de trabajo y el run JSON con Dani; el orquestador no repetirá esa modificación automáticamente.",
        ),
      );
      await printFinalReport(run);
      return;
    }
  } else {
    if (!args.task) {
      printUsage();
      process.exit(2);
    }
    const baseline = await captureCleanBaseline();
    run = newRun(args.task, args.mode, baseline);
    saveRun(run);
    log(`Run nuevo: ${run.runId}`);
    isNewRun = true;
  }

  acquireWorktreeLock(run.runId);
  try {
    if (isNewRun) await startBothreadWorkspace(run);
    else await prepareBothreadWorkspace(run);
    await runOrchestration(run);
  } catch (e) {
    if (!TERMINAL_STATES.has(run.status)) fail(run, e);
    try {
      await printFinalReport(run);
    } catch (reportError) {
      log(
        `[bothread] no se pudo publicar el informe final: ${reportError.message}`,
      );
    }
  } finally {
    process.exitCode = run.status === "FAILED" ? 1 : 0;
    releaseWorktreeLock();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    log(`[fatal] ${e.stack || e}`);
    process.exit(1);
  });
}
