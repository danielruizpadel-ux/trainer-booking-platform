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
  SYNTHESIS: ["IMPLEMENTATION", "FAILED"],
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

function newRun(task, bothreadSessionId, baseline) {
  const runId = `run_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  return {
    runId,
    task,
    status: "RECEIVED",
    createdAt: now,
    updatedAt: now,
    bothreadSessionId: bothreadSessionId ?? null,
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
  fs.writeFileSync(tmp, JSON.stringify(run, null, 2));
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

async function callClaude(
  prompt,
  { tools, resumeSessionId, timeoutMs, permissionMode } = {},
) {
  const args = [
    "-p",
    "--output-format",
    "json",
    "--permission-prompts",
    "none",
  ];
  if (permissionMode) args.push("--permission-mode", permissionMode);
  if (tools) args.push("--tools", tools);
  if (resumeSessionId) args.push("--resume", resumeSessionId);
  args.push("--", prompt);

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
      raw: proc,
    };
  }

  if (parsed.is_error) {
    return {
      ok: false,
      error: `claude reportó is_error: ${redact(parsed.result ?? "").slice(0, 2000)}`,
      durationMs,
      sessionId: parsed.session_id,
      raw: parsed,
    };
  }

  return {
    ok: true,
    text: redact(parsed.result ?? ""),
    sessionId: parsed.session_id ?? null,
    costUsd: parsed.total_cost_usd ?? null,
    durationMs,
  };
}

// ---------------------------------------------------------------------------
// Runner de Codex CLI (headless, JSONL, sin shell). Bothread NO está
// disponible aquí (verificado) — Codex nunca intenta hablar con la room.
// ---------------------------------------------------------------------------

async function callCodex(prompt, { sandbox, resumeThreadId, timeoutMs } = {}) {
  // `codex exec resume <id>` NO acepta --sandbox ni -C (verificado con
  // `codex exec resume --help`): el sandbox y el cwd son propiedad del
  // thread original, no se repiten al reanudar.
  const args = resumeThreadId
    ? ["exec", "resume", resumeThreadId, "--json", prompt]
    : ["exec", "--json", "--sandbox", sandbox, "-C", REPO_ROOT, prompt];

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
  };
}

// ---------------------------------------------------------------------------
// Cliente Bothread mínimo — JSON-RPC crudo sobre HTTP, sin SDK de MCP.
// Best-effort: un fallo aquí se registra y NUNCA bloquea el flujo principal
// (Bothread es el bus de auditoría, no el motor de la tarea).
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

async function bothreadNotify(run, text, { importance = "info", note } = {}) {
  if (!run.bothreadSessionId) return;
  try {
    // No enumerable: así JSON.stringify(run) nunca lo serializa (el run.json
    // no debe llevar el objeto cliente) y, si el run viene de loadRun() (un
    // JSON plano), aquí siempre estará ausente de verdad -> se recrea el
    // cliente real en vez de reusar un objeto sin métodos.
    if (!run._bothread) {
      Object.defineProperty(run, "_bothread", {
        value: new BothreadClient(POLICY.bothread.url),
        enumerable: false,
        configurable: true,
      });
    }
    if (!run._bothread.joined) await run._bothread.join(run.bothreadSessionId);
    await run._bothread.sendMessage(run.bothreadSessionId, text, importance);
    if (note)
      await run._bothread.recordNote(
        run.bothreadSessionId,
        note.kind,
        note.title,
        note.detail,
      );
  } catch (e) {
    log(`[bothread] best-effort fallo (no bloquea el run): ${e.message}`);
    recordStep(run, "bothread_warning", { message: redact(e.message) });
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

function claudeAnalysisPrompt(task) {
  return [
    "Eres un participante de un flujo automatizado de dos agentes (Claude + Codex) orquestado por un script Node, trabajando sobre el repositorio en el directorio actual.",
    "Este es un paso de ANÁLISIS INDEPENDIENTE y de solo lectura — no tienes herramientas de escritura en este turno (no puedes editar nada).",
    "",
    `Tarea encargada por Dani (dueño del proyecto): "${task}"`,
    "",
    "Lee lo que necesites (CLAUDE.md, docs/, código relevante) para entender la tarea en el contexto real de este proyecto concreto.",
    "Escribe un análisis técnico conciso: qué hay que cambiar, por qué, qué archivos probablemente estén implicados, riesgos, y cualquier cosa ambigua que debería decidir un humano.",
    "Si tienes disponible alguna herramienta MCP cuyo nombre empiece por mcp__bothread__, puedes (opcional, no obligatorio) usar send_message para avisar en la sala que estás empezando el análisis.",
    "",
    "No implementes nada. No ejecutes comandos destructivos. Esto es solo análisis.",
    SECRET_WARNING,
  ].join("\n");
}

function codexAnalysisPrompt(task) {
  return [
    "Eres un participante de un flujo automatizado de dos agentes (Claude + Codex) orquestado por un script Node, trabajando sobre el repositorio en el directorio actual.",
    "Este es un paso de ANÁLISIS INDEPENDIENTE. Estás en sandbox read-only: no puedes escribir nada aunque lo intentaras.",
    "No tienes acceso a Bothread en este modo — no intentes usarlo, nadie lo verá.",
    "",
    `Tarea encargada por Dani (dueño del proyecto): "${task}"`,
    "",
    "Lee lo que necesites del repositorio para entender la tarea en su contexto real.",
    "Escribe un análisis técnico conciso e independiente (no has visto el análisis de Claude): qué hay que cambiar, por qué, archivos probablemente implicados, riesgos.",
    SECRET_WARNING,
  ].join("\n");
}

function synthesisPrompt(task, claudeAnalysis, codexAnalysis) {
  return [
    "Sigues en modo de solo lectura (sin herramientas de escritura). Ahora tienes DOS análisis independientes de la misma tarea: el tuyo propio y el de Codex, un agente distinto que la analizó sin ver el tuyo.",
    "",
    `Tarea original: "${task}"`,
    "",
    "--- Tu análisis (Claude) ---",
    claudeAnalysis,
    "",
    "--- Análisis de Codex ---",
    codexAnalysis,
    "",
    'Produce una SÍNTESIS técnica: en qué coincidís, en qué discrepáis (si acaso), y UN plan de implementación concreto y acordado — el que se va a implementar literalmente a continuación, así que sé específico sobre archivos y cambios. Si hay una decisión de arquitectura relevante aquí, y tienes disponible una herramienta MCP mcp__bothread__record_note, puedes (opcional) registrarla como "decision".',
    SECRET_WARNING,
  ].join("\n");
}

function implementationPrompt(task, plan) {
  return [
    "Ahora SÍ tienes herramientas de escritura (Read, Edit, Write, Grep, Glob) pero NO tienes Bash: no puedes ejecutar git, npm, ni ningún comando de shell bajo ningún concepto en este turno — es una restricción técnica del proceso, no una petición.",
    "Por eso NUNCA vas a poder hacer git commit, git push, una migración ni ninguna acción destructiva: literalmente no tienes la herramienta para intentarlo.",
    "",
    `Tarea original: "${task}"`,
    "",
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
) {
  return [
    `Eres el revisor de código de este flujo. Ronda de revisión ${iteration} de máximo ${maxIterations}.`,
    "Estás en sandbox read-only pero SÍ puedes ejecutar comandos de solo lectura (git diff, git status, cat, grep, etc.) para inspeccionar el estado real del repositorio — hazlo, no confíes solo en lo que se te cuenta aquí.",
    "",
    `Tarea original: "${task}"`,
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

function claudeFixPrompt(codexReviewText) {
  return [
    "Codex ha revisado tu implementación y ha pedido cambios. Sigues sin Bash — solo Read, Edit, Write, Grep, Glob.",
    "",
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
  const res = await callClaude(claudeAnalysisPrompt(run.task), {
    tools: POLICY.claude.analysisTools,
  });
  recordStep(run, "claude_analysis", {
    ok: res.ok,
    text: res.text,
    sessionId: res.sessionId,
    costUsd: res.costUsd,
    durationMs: res.durationMs,
    error: res.error,
  });
  if (!res.ok) return fail(run, res.error);
  transition(run, "CODEX_ANALYSIS", "análisis de Claude completo");
}

async function stepCodexAnalysis(run) {
  const res = await callCodex(codexAnalysisPrompt(run.task), {
    sandbox: POLICY.codex.analysisSandbox,
  });
  if (res.ok) run.codexThreadId = res.threadId ?? run.codexThreadId;
  recordStep(run, "codex_analysis", {
    ok: res.ok,
    text: res.text,
    threadId: res.threadId,
    commands: res.commands,
    durationMs: res.durationMs,
    error: res.error,
  });
  if (!res.ok) return fail(run, res.error);
  const claudeText = lastStep(run, "claude_analysis").text;
  await bothreadNotify(
    run,
    `Orchestrator: análisis de Codex recibido (thread ${res.threadId}). Relay del texto completo abajo.\n\n--- Análisis de Codex ---\n${res.text}`,
  );
  await bothreadNotify(
    run,
    `--- Análisis de Claude (para referencia) ---\n${claudeText}`,
  );
  transition(run, "SYNTHESIS", "análisis de Codex recibido y relayado");
}

async function stepSynthesis(run) {
  const claudeText = lastStep(run, "claude_analysis").text;
  const codexText = lastStep(run, "codex_analysis").text;
  const res = await callClaude(
    synthesisPrompt(run.task, claudeText, codexText),
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
  if (!res.ok) return fail(run, res.error);
  await bothreadNotify(
    run,
    `Orchestrator: síntesis/plan acordado —\n\n${res.text}`,
    {
      note: {
        kind: "decision",
        title: `Plan acordado: ${run.task}`.slice(0, 200),
        detail: res.text,
      },
    },
  );
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
  const res = await callClaude(implementationPrompt(run.task, plan), {
    tools: POLICY.claude.implementationTools,
    permissionMode: "acceptEdits",
  });
  recordStep(run, "implementation", {
    ok: res.ok,
    text: res.text,
    sessionId: res.sessionId,
    costUsd: res.costUsd,
    durationMs: res.durationMs,
    error: res.error,
  });
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
  );

  let res = await callCodex(prompt, {
    sandbox: POLICY.codex.reviewSandbox,
    resumeThreadId: run.codexThreadId,
  });
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
    `Orchestrator: revisión de Codex #${run.reviewIteration} — veredicto ${verdict}.\n\n${res.text}`,
  );

  if (verdict === "ACCEPTED") {
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
  const res = await callClaude(claudeFixPrompt(review.text), {
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
    `Orchestrator: fix #${run.reviewIteration} aplicado por Claude —\n\n${res.text}`,
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
  if (run._bothread)
    await run._bothread.leave(run.bothreadSessionId).catch(() => {});
}

// ---------------------------------------------------------------------------
// Informe final para Dani
// ---------------------------------------------------------------------------

async function printFinalReport(run) {
  const diff = await gitDiff();
  const status = await gitStatusShort();
  const lastReview = run.history
    .filter((h) => h.kind === "codex_review")
    .at(-1);
  const fixes = run.history.filter((h) => h.kind === "claude_fix");
  const unverified = [
    "No se ha ejecutado en navegador ni contra una app en marcha — solo análisis estático + type-check + format:check.",
    "El orquestador no ha hecho commit, push, deploy, migraciones ni tocado credenciales — eso lo decide Dani.",
  ];

  const lines = [
    "=".repeat(70),
    `INFORME FINAL — ${run.runId}`,
    "=".repeat(70),
    `Tarea: ${run.task}`,
    `Estado final: ${run.status}`,
    `Rondas de revisión usadas: ${run.reviewIteration} de ${POLICY.maxReviewIterations}`,
    `Veredicto de Codex: ${lastReview?.verdict ?? "n/a"}`,
    "",
    "--- git status --short ---",
    status || "(sin cambios)",
    "",
    "--- git diff (resumen: primeras 4000 chars) ---",
    diff ? diff.slice(0, 4000) : "(sin diff)",
    "",
    "--- Comprobaciones ejecutadas por el orquestador ---",
    JSON.stringify(
      fixes.at(-1)?.validation ??
        run.history.find((h) => h.kind === "post_implementation_check")
          ?.validation ??
        {},
      null,
      2,
    ),
    "",
    `--- Fixes aplicados (${fixes.length}) ---`,
    fixes
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
  await bothreadNotify(
    run,
    `Orchestrator: run ${run.runId} terminado en estado ${run.status}.\n\n${report.slice(0, 3000)}`,
    {
      importance: run.status === "WAITING_FOR_DANI" ? "steering" : "interrupt",
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
      "  Resume:      node orchestrator/orchestrate-v1.mjs --resume RUN_ID",
      "  Help:        node orchestrator/orchestrate-v1.mjs --help",
    ].join("\n") + "\n",
  );
}

function parseArgs(argv) {
  const args = {
    task: null,
    resume: null,
    help: false,
    bothreadSession:
      POLICY.bothread.sessionId ?? process.env.BOTHREAD_SESSION_ID ?? null,
  };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--help" || argv[i] === "-h") args.help = true;
    else if (argv[i] === "--resume") args.resume = argv[++i];
    else if (argv[i] === "--bothread-session") args.bothreadSession = argv[++i];
    else rest.push(argv[i]);
  }
  args.task = rest.join(" ").trim() || null;
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  let run;
  if (args.resume) {
    run = loadRun(args.resume);
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
    run = newRun(args.task, args.bothreadSession, baseline);
    saveRun(run);
    log(`Run nuevo: ${run.runId}`);
  }

  acquireWorktreeLock(run.runId);
  try {
    await runOrchestration(run);
    process.exitCode = run.status === "FAILED" ? 1 : 0;
  } finally {
    releaseWorktreeLock();
  }
}

main().catch((e) => {
  log(`[fatal] ${e.stack || e}`);
  process.exit(1);
});
