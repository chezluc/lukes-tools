import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

const HOST = "127.0.0.1";
const PORT = Number(process.env.BRIDGE_PORT ?? "4471");
const INSTANCE = process.env.BRIDGE_INSTANCE ?? "default";
const LEASE_MS = Number(process.env.BRIDGE_LEASE_MS ?? "120000");
const RESULT_TTL_MS = Number(process.env.BRIDGE_RESULT_TTL_MS ?? String(24 * 60 * 60 * 1000));
const WORKER_ONLINE_MS = 15000;
const MAX_WAIT_MS = 60000;

const ALLOWED_COMMAND_TYPES = new Set([
  "RUN_SNIPPET",
  "GET_STATE",
  "GET_AI_STATE",
  "OPEN_URL",
  "OPEN_TAB",
  "CLOSE_TAB",
  "LIST_TABS",
  "CLICK_ELEMENT",
]);

const AUTO_TARGET_LOCK = "auto-target";
const queue = [];
const results = new Map();
const sessions = new Map(); // sessionId -> { id, name, tabId, url, createdAt, lastUsedAt }
const workers = new Map(); // workerId -> { lastSeenAt }
const waiters = new Map(); // commandId -> [resolve]

function isoNow() {
  return new Date().toISOString();
}

function json(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  response.end(JSON.stringify(payload));
}

function apiError(response, status, error, fix) {
  json(response, status, { ok: false, error, fix });
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (chunk) => {
      data += chunk;
    });
    request.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function commandLockKeys(command) {
  const keys = [];
  if (command.targetTabId != null) {
    keys.push(`tab:${command.targetTabId}`);
  } else if (command.type !== "LIST_TABS" && command.type !== "OPEN_TAB") {
    keys.push(AUTO_TARGET_LOCK);
  }
  if (command.exclusiveKey) {
    keys.push(`exclusive:${command.exclusiveKey}`);
  }
  return keys;
}

function trimExpiredResults() {
  const now = Date.now();
  for (const [id, entry] of results.entries()) {
    if (entry.status !== "completed" || !entry.completedAt) {
      continue;
    }
    if (Date.parse(entry.completedAt) + RESULT_TTL_MS < now) {
      results.delete(id);
    }
  }
}

function requeueExpiredClaims() {
  const now = Date.now();
  for (const [id, entry] of results.entries()) {
    if (entry.status !== "running") {
      continue;
    }
    if (!entry.leaseExpiresAt || entry.leaseExpiresAt > now) {
      continue;
    }
    queue.unshift(entry.command);
    results.set(id, {
      ...entry,
      status: "queued",
      claimedBy: null,
      startedAt: null,
      leaseExpiresAt: null,
      requeuedAt: isoNow(),
      lockKeys: [],
    });
  }
}

function runningLockSet() {
  const locks = new Set();
  const now = Date.now();
  for (const entry of results.values()) {
    if (entry.status !== "running") {
      continue;
    }
    if (entry.leaseExpiresAt && entry.leaseExpiresAt <= now) {
      continue;
    }
    for (const key of entry.lockKeys || []) {
      locks.add(key);
    }
  }
  return locks;
}

function buildCommand(input) {
  return {
    id: input.id || randomUUID(),
    type: input.type,
    payload: input.payload || {},
    targetTabId: input.targetTabId,
    sessionId: input.sessionId || null,
    exclusiveKey: input.exclusiveKey || null,
    createdAt: isoNow(),
  };
}

function enqueueCommand(command) {
  if (!ALLOWED_COMMAND_TYPES.has(command.type)) {
    throw new Error(`Invalid command type: ${command.type}. Allowed: ${[...ALLOWED_COMMAND_TYPES].join(", ")}`);
  }
  if (results.has(command.id)) {
    throw new Error(`Duplicate command id: ${command.id}`);
  }
  queue.push(command);
  results.set(command.id, {
    status: "queued",
    command,
    createdAt: command.createdAt,
    claimedBy: null,
    startedAt: null,
    leaseExpiresAt: null,
    lockKeys: [],
  });
}

function claimNextCommand(workerId = `worker-${randomUUID()}`) {
  requeueExpiredClaims();
  trimExpiredResults();
  workers.set(workerId, { lastSeenAt: Date.now() });

  const locks = runningLockSet();
  for (let index = 0; index < queue.length; index += 1) {
    const command = queue[index];
    const lockKeys = commandLockKeys(command);
    if (lockKeys.some((key) => locks.has(key))) {
      continue;
    }

    queue.splice(index, 1);
    const startedAt = isoNow();
    const leaseExpiresAt = Date.now() + LEASE_MS;
    const existing = results.get(command.id) || { command };
    results.set(command.id, {
      ...existing,
      status: "running",
      command,
      claimedBy: workerId,
      startedAt,
      leaseExpiresAt,
      lockKeys,
    });
    return command;
  }

  return null;
}

function refreshLease(id, workerId) {
  const entry = results.get(id);
  if (!entry || entry.status !== "running") {
    return { ok: false, error: "Command is not running" };
  }
  if (workerId && entry.claimedBy && workerId !== entry.claimedBy) {
    return { ok: false, error: "Worker does not own command lease" };
  }
  if (workerId) {
    workers.set(workerId, { lastSeenAt: Date.now() });
  }
  entry.leaseExpiresAt = Date.now() + LEASE_MS;
  results.set(id, entry);
  return { ok: true, leaseExpiresAt: new Date(entry.leaseExpiresAt).toISOString() };
}

function notifyWaiters(id) {
  const list = waiters.get(id);
  if (!list) return;
  waiters.delete(id);
  for (const resolve of list) resolve();
}

function completeCommand(id, body) {
  const existing = results.get(id);
  if (!existing) {
    return { ok: false, status: 404, payload: { ok: false, error: "Unknown command id" } };
  }
  results.set(id, {
    ...existing,
    status: "completed",
    completedAt: isoNow(),
    leaseExpiresAt: null,
    response: body,
  });
  notifyWaiters(id);
  return { ok: true, status: 200, payload: { ok: true } };
}

async function waitForCompletion(id, waitMs) {
  const deadline = Date.now() + Math.min(Math.max(waitMs, 0), MAX_WAIT_MS);
  for (;;) {
    const entry = results.get(id);
    if (entry && entry.status === "completed") {
      return entry;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      return entry ?? null;
    }
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, Math.min(remaining, 1000));
      const list = waiters.get(id) || [];
      list.push(() => {
        clearTimeout(timer);
        resolve();
      });
      waiters.set(id, list);
    });
  }
}

function parseWaitSeconds(url) {
  const raw = url.searchParams.get("wait");
  if (!raw) return 0;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value * 1000 : 0;
}

function onlineWorkers() {
  const now = Date.now();
  const online = [];
  for (const [id, info] of workers.entries()) {
    if (now - info.lastSeenAt <= WORKER_ONLINE_MS) {
      online.push({ workerId: id, lastSeenAt: new Date(info.lastSeenAt).toISOString() });
    }
  }
  return online;
}

function lastWorkerSeenAt() {
  let last = 0;
  for (const info of workers.values()) {
    if (info.lastSeenAt > last) last = info.lastSeenAt;
  }
  return last ? new Date(last).toISOString() : null;
}

function healthPayload() {
  requeueExpiredClaims();
  trimExpiredResults();
  const running = Array.from(results.values()).filter((entry) => entry.status === "running").length;
  const online = onlineWorkers();
  return {
    ok: true,
    instance: INSTANCE,
    host: HOST,
    port: PORT,
    baseUrl: `http://${HOST}:${PORT}`,
    queue: queue.length,
    running,
    results: results.size,
    sessions: sessions.size,
    workersOnline: online.length,
    workers: online,
    lastWorkerSeenAt: lastWorkerSeenAt(),
    extensionConnected: online.length > 0,
    leaseMs: LEASE_MS,
    hint: online.length > 0
      ? "Extension worker is polling. Bridge fully operational."
      : "No extension worker polling. Make sure the browser is running with the v6 extension enabled; its bridge.html worker tab opens automatically.",
  };
}

function apiDocs() {
  return {
    ok: true,
    name: "Chrome Console Bridge v6",
    instance: INSTANCE,
    baseUrl: `http://${HOST}:${PORT}`,
    quickstart: [
      "1. GET /health — extensionConnected:true means everything is ready. Nothing else to check or open.",
      "2. POST /sessions {\"name\":\"my-task\",\"url\":\"https://example.com\"} — creates a dedicated BACKGROUND tab, returns sessionId + tabId.",
      "3. POST /commands?wait=20 {\"sessionId\":\"...\",\"type\":\"RUN_SNIPPET\",\"payload\":{\"code\":\"return document.title\",\"world\":\"MAIN\"}} — runs JS in YOUR tab and returns the result in the same request.",
      "4. DELETE /sessions/<id> when done (optional).",
    ],
    endpoints: {
      "GET /": "This document.",
      "GET /health": "Server + extension status. extensionConnected:true = fully operational.",
      "POST /sessions": "body {name?, url} → creates a background tab, returns {sessionId, tabId}. Each agent should own one session; commands are serialized per tab so sessions never collide.",
      "GET /sessions": "List sessions.",
      "DELETE /sessions/<sessionId>": "Close the session's tab and forget it.",
      "POST /commands[?wait=N]": "Queue a command. With wait=N (seconds, max 60) the response includes the completed result — no polling needed.",
      "GET /commands/<id>[?wait=N]": "Fetch (optionally long-poll) a command result.",
      "GET /ai-state[?targetTabId=]": "Synchronous page snapshot (screenshot + element tree). Uses the debugger API (shows Chrome's debug banner briefly).",
      "GET /commands/claim?workerId=": "(extension internal) claim next command.",
      "POST /commands/<id>/heartbeat": "(extension internal) extend lease.",
      "POST /commands/<id>/result": "(extension internal) post result.",
    },
    commandTypes: {
      RUN_SNIPPET: "payload {code, world: 'MAIN'|'ISOLATED', snippetName?}. code is an async function body; use return. Runs via chrome.scripting (no debug banner, background-safe); auto-falls back to the debugger API on CSP-strict pages.",
      OPEN_TAB: "payload {url, active?:false, waitMs?:20000}. Creates a tab WITHOUT focusing it and waits for the page load. Prefer POST /sessions, which wraps this.",
      OPEN_URL: "payload {url, active?:false} + optional targetTabId. Navigates an existing tab (or creates one). Background by default.",
      CLOSE_TAB: "requires targetTabId.",
      LIST_TABS: "List all http(s) tabs with ids.",
      GET_AI_STATE: "Screenshot + interactive-element tree for the target tab (debugger API).",
      GET_STATE: "Extension state (current url, run history).",
    },
    addressing: "Every command accepts sessionId (preferred) or targetTabId. Omitting both targets the most recently used tab — avoid this when multiple agents share the bridge.",
    health: healthPayload(),
  };
}

const server = createServer(async (request, response) => {
  if (!request.url) {
    return apiError(response, 404, "Not found", "GET / lists all endpoints.");
  }

  const url = new URL(request.url, `http://${HOST}:${PORT}`);
  const parts = url.pathname.split("/").filter(Boolean);

  if (request.method === "OPTIONS") {
    return json(response, 204, {});
  }

  if (request.method === "GET" && url.pathname === "/") {
    return json(response, 200, apiDocs());
  }

  if (request.method === "GET" && url.pathname === "/health") {
    return json(response, 200, healthPayload());
  }

  if (request.method === "POST" && url.pathname === "/sessions") {
    try {
      const body = await readBody(request);
      if (!body.url || !/^https?:/i.test(body.url)) {
        return apiError(response, 400, "sessions_requires_url", "POST /sessions with body {\"name\":\"my-task\",\"url\":\"https://...\"}");
      }
      if (onlineWorkers().length === 0) {
        return apiError(response, 503, "no_extension_worker",
          "No extension worker is polling this queue. Start the target browser (the v6 extension auto-opens its worker tab). If the browser is running, check chrome://extensions that 'Chrome Console Bridge v6' is enabled.");
      }
      const command = buildCommand({
        type: "OPEN_TAB",
        payload: { url: body.url, active: Boolean(body.active), waitMs: body.waitMs },
      });
      enqueueCommand(command);
      const entry = await waitForCompletion(command.id, 30000);
      if (!entry || entry.status !== "completed") {
        return apiError(response, 504, "session_create_timeout",
          "The extension did not open the tab in time. GET /health — if workersOnline is 0, the browser or extension is not running.");
      }
      const run = entry.response?.run;
      if (!entry.response?.ok || !run?.tabId) {
        return json(response, 502, { ok: false, error: "session_create_failed", detail: entry.response });
      }
      const session = {
        id: `s-${randomUUID().slice(0, 8)}`,
        name: body.name || "session",
        tabId: run.tabId,
        url: run.url ?? body.url,
        createdAt: isoNow(),
        lastUsedAt: isoNow(),
      };
      sessions.set(session.id, session);
      return json(response, 201, { ok: true, sessionId: session.id, ...session });
    } catch (error) {
      return apiError(response, 400, error instanceof Error ? error.message : String(error));
    }
  }

  if (request.method === "GET" && url.pathname === "/sessions") {
    return json(response, 200, { ok: true, sessions: Array.from(sessions.values()) });
  }

  if (request.method === "DELETE" && parts[0] === "sessions" && parts.length === 2) {
    const id = decodeURIComponent(parts[1]);
    const session = sessions.get(id);
    if (!session) {
      return apiError(response, 404, "session_not_found", "GET /sessions to list active sessions.");
    }
    sessions.delete(id);
    try {
      const command = buildCommand({ type: "CLOSE_TAB", targetTabId: session.tabId });
      enqueueCommand(command);
      await waitForCompletion(command.id, 10000);
    } catch {
      // Session forgotten either way; a dangling tab is harmless.
    }
    return json(response, 200, { ok: true, closed: id });
  }

  if (request.method === "POST" && url.pathname === "/commands") {
    try {
      const body = await readBody(request);
      if (body.sessionId) {
        const session = sessions.get(body.sessionId);
        if (!session) {
          return apiError(response, 404, "session_not_found",
            "GET /sessions to list active sessions, or POST /sessions to create one.");
        }
        session.lastUsedAt = isoNow();
        body.targetTabId = session.tabId;
      }
      const command = buildCommand(body);
      enqueueCommand(command);
      const waitMs = parseWaitSeconds(url);
      if (waitMs > 0) {
        const entry = await waitForCompletion(command.id, waitMs);
        if (entry && entry.status === "completed") {
          return json(response, 200, { ok: true, id: command.id, ...entry });
        }
        return json(response, 202, {
          ok: true,
          id: command.id,
          status: entry?.status ?? "queued",
          note: `Not completed within ${Math.round(waitMs / 1000)}s. Poll GET /commands/${command.id}?wait=20. If this repeats, GET /health — workersOnline 0 means the browser/extension is not running.`,
        });
      }
      return json(response, 202, { ok: true, id: command.id, status: "queued" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message.startsWith("Duplicate command id") ? 409 : 400;
      return apiError(response, status, message);
    }
  }

  if (request.method === "GET" && url.pathname === "/ai-state") {
    const targetTabIdStr = url.searchParams.get("targetTabId");
    const sessionId = url.searchParams.get("sessionId");
    let targetTabId = targetTabIdStr ? parseInt(targetTabIdStr, 10) : undefined;
    if (sessionId) {
      const session = sessions.get(sessionId);
      if (!session) {
        return apiError(response, 404, "session_not_found", "GET /sessions to list active sessions.");
      }
      targetTabId = session.tabId;
    }
    const command = buildCommand({ type: "GET_AI_STATE", payload: {}, targetTabId });
    enqueueCommand(command);
    const entry = await waitForCompletion(command.id, 30000);
    if (entry && entry.status === "completed") {
      results.delete(command.id);
      return json(response, 200, entry.response);
    }
    return apiError(response, 408, "Timeout waiting for AI state", "GET /health — check workersOnline.");
  }

  if (request.method === "GET" && (url.pathname === "/commands/claim" || url.pathname === "/commands/next")) {
    const workerId = url.searchParams.get("workerId") || `worker-${randomUUID()}`;
    const command = claimNextCommand(workerId);
    return json(response, 200, { ok: true, command });
  }

  if (request.method === "GET" && parts[0] === "commands" && parts.length === 2) {
    const id = decodeURIComponent(parts[1]);
    const waitMs = parseWaitSeconds(url);
    let entry = results.get(id);
    if (waitMs > 0 && entry && entry.status !== "completed") {
      entry = await waitForCompletion(id, waitMs);
    }
    if (!entry) {
      return apiError(response, 404, "Unknown command id");
    }
    return json(response, 200, { ok: true, ...entry });
  }

  if (request.method === "POST" && parts[0] === "commands" && parts[2] === "heartbeat") {
    try {
      const id = decodeURIComponent(parts[1] || "");
      const body = await readBody(request);
      const result = refreshLease(id, body.workerId);
      return json(response, result.ok ? 200 : 409, result);
    } catch (error) {
      return apiError(response, 400, error instanceof Error ? error.message : String(error));
    }
  }

  if (request.method === "POST" && parts[0] === "commands" && parts[2] === "result") {
    const id = decodeURIComponent(parts[1] || "");
    try {
      const body = await readBody(request);
      const result = completeCommand(id, body);
      return json(response, result.status, result.payload);
    } catch (error) {
      return apiError(response, 400, error instanceof Error ? error.message : String(error));
    }
  }

  return apiError(response, 404, "Not found", "GET / lists all endpoints and command types.");
});

server.listen(PORT, HOST, () => {
  console.log(`Chrome Console Bridge v6 [${INSTANCE}] listening on http://${HOST}:${PORT}`);
});
