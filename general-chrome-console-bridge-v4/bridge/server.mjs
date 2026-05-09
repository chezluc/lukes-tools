import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

const HOST = "127.0.0.1";
const PORT = Number(process.env.BRIDGE_PORT ?? "4471");
const INSTANCE = process.env.BRIDGE_INSTANCE ?? "default";
const LEASE_MS = Number(process.env.BRIDGE_LEASE_MS ?? "120000");
const RESULT_TTL_MS = Number(process.env.BRIDGE_RESULT_TTL_MS ?? String(24 * 60 * 60 * 1000));

const ALLOWED_COMMAND_TYPES = new Set([
  "RUN_SNIPPET",
  "GET_STATE",
  "GET_AI_STATE",
  "OPEN_URL",
  "LIST_TABS",
]);

const AUTO_TARGET_LOCK = "auto-target";
const queue = [];
const results = new Map();

function isoNow() {
  return new Date().toISOString();
}

function json(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  response.end(JSON.stringify(payload));
}

function notFound(response) {
  json(response, 404, { ok: false, error: "Not found" });
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
  } else if (command.type !== "LIST_TABS") {
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
    exclusiveKey: input.exclusiveKey || null,
    createdAt: isoNow(),
  };
}

function enqueueCommand(command) {
  if (!ALLOWED_COMMAND_TYPES.has(command.type)) {
    throw new Error("Invalid command type");
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
  entry.leaseExpiresAt = Date.now() + LEASE_MS;
  results.set(id, entry);
  return { ok: true, leaseExpiresAt: new Date(entry.leaseExpiresAt).toISOString() };
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
  return { ok: true, status: 200, payload: { ok: true } };
}

const server = createServer(async (request, response) => {
  if (!request.url) {
    return notFound(response);
  }

  const url = new URL(request.url, `http://${HOST}:${PORT}`);
  const parts = url.pathname.split("/").filter(Boolean);

  if (request.method === "OPTIONS") {
    return json(response, 204, {});
  }

  if (request.method === "GET" && url.pathname === "/health") {
    requeueExpiredClaims();
    trimExpiredResults();
    const running = Array.from(results.values()).filter((entry) => entry.status === "running").length;
    return json(response, 200, {
      ok: true,
      instance: INSTANCE,
      host: HOST,
      port: PORT,
      baseUrl: `http://${HOST}:${PORT}`,
      queue: queue.length,
      running,
      results: results.size,
      leaseMs: LEASE_MS,
    });
  }

  if (request.method === "POST" && url.pathname === "/commands") {
    try {
      const body = await readBody(request);
      const command = buildCommand(body);
      enqueueCommand(command);
      return json(response, 202, { ok: true, id: command.id, status: "queued" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message.startsWith("Duplicate command id") ? 409 : 400;
      return json(response, status, { ok: false, error: message });
    }
  }

  if (request.method === "GET" && url.pathname === "/ai-state") {
    const id = randomUUID();
    const targetTabIdStr = url.searchParams.get("targetTabId");
    const targetTabId = targetTabIdStr ? parseInt(targetTabIdStr, 10) : undefined;
    const command = buildCommand({
      id,
      type: "GET_AI_STATE",
      payload: {},
      targetTabId,
    });
    enqueueCommand(command);

    let attempts = 0;
    while (attempts < 60) {
      const entry = results.get(id);
      if (entry && entry.status === "completed") {
        results.delete(id);
        return json(response, 200, entry.response);
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
      attempts += 1;
    }
    return json(response, 408, { ok: false, error: "Timeout waiting for AI state" });
  }

  if (request.method === "GET" && (url.pathname === "/commands/claim" || url.pathname === "/commands/next")) {
    const workerId = url.searchParams.get("workerId") || `worker-${randomUUID()}`;
    const command = claimNextCommand(workerId);
    return json(response, 200, { ok: true, command });
  }

  if (request.method === "GET" && parts[0] === "commands" && parts.length === 2) {
    const id = decodeURIComponent(parts[1]);
    const entry = results.get(id);
    if (!entry) {
      return json(response, 404, { ok: false, error: "Unknown command id" });
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
      return json(response, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (request.method === "POST" && parts[0] === "commands" && parts[2] === "result") {
    const id = decodeURIComponent(parts[1] || "");
    try {
      const body = await readBody(request);
      const result = completeCommand(id, body);
      return json(response, result.status, result.payload);
    } catch (error) {
      return json(response, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return notFound(response);
});

server.listen(PORT, HOST, () => {
  console.log(`Chrome Console Bridge server [${INSTANCE}] listening on http://${HOST}:${PORT}`);
});
