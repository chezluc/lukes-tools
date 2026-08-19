import { STORAGE_KEYS } from "../shared/constants";
import type { BridgeRequest, BridgeResponse } from "../shared/messages";
import { BRIDGE_BROWSER_LABEL, BRIDGE_INSTANCE, DEFAULT_BRIDGE_BASE_URL } from "../shared/runtime-config";
import type { BridgeRuntimeConfig } from "../shared/types";

type AgentCommand =
  | { id: string; type: "RUN_SNIPPET"; payload: { code: string; world: "ISOLATED" | "MAIN"; snippetName?: string }; targetTabId?: number }
  | { id: string; type: "OPEN_URL"; payload: { url: string; active?: boolean }; targetTabId?: number }
  | { id: string; type: "OPEN_TAB"; payload: { url: string; active?: boolean; waitMs?: number } }
  | { id: string; type: "CLOSE_TAB"; targetTabId: number }
  | { id: string; type: "GET_STATE"; targetTabId?: number }
  | { id: string; type: "LIST_TABS" }
  | { id: string; type: "GET_AI_STATE"; targetTabId?: number };

const serverStatus = document.getElementById("serverStatus");
const pollStatus = document.getElementById("pollStatus");
const lastCommand = document.getElementById("lastCommand");
const lastResult = document.getElementById("lastResult");
const logOutput = document.getElementById("logOutput");
const bridgeInstance = document.getElementById("bridgeInstance");
const bridgeServerUrl = document.getElementById("bridgeServerUrl");
const bridgeServerInput = document.getElementById("bridgeServerInput") as HTMLInputElement | null;
const bridgeConfigStatus = document.getElementById("bridgeConfigStatus");
const saveBridgeConfigButton = document.getElementById("saveBridgeConfig");
const resetBridgeConfigButton = document.getElementById("resetBridgeConfig");
const workerIdElement = document.getElementById("workerId");

let running = false;
let stopped = false;
let bridgeBaseUrl = DEFAULT_BRIDGE_BASE_URL;

function setStatus(element: HTMLElement | null, text: string, ok = false) {
  if (!element) return;
  element.textContent = text;
  element.classList.toggle("ok", ok);
  element.classList.toggle("bad", !ok);
}

function appendLog(message: string) {
  const time = new Date().toISOString();
  console.log(`[Bridge] ${time} ${message}`);
  if (logOutput) {
    logOutput.textContent = `${time} ${message}\n${logOutput.textContent}`.trim().slice(0, 20000);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getWorkerId() {
  const stored = window.sessionStorage.getItem("bridgeWorkerId");
  if (stored) {
    return stored;
  }
  const label = new URLSearchParams(window.location.search).get("worker") || "worker";
  const id = `${label}-${crypto.randomUUID().slice(0, 8)}`;
  window.sessionStorage.setItem("bridgeWorkerId", id);
  return id;
}

const workerId = getWorkerId();

function normalizeBridgeBaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) {
    throw new Error("Bridge server URL is required.");
  }
  const url = new URL(trimmed);
  if (!/^https?:$/i.test(url.protocol)) {
    throw new Error("Bridge server URL must start with http:// or https://");
  }
  return url.toString().replace(/\/+$/, "");
}

function setBridgeUrl(url: string) {
  bridgeBaseUrl = normalizeBridgeBaseUrl(url);
  if (bridgeServerUrl) {
    bridgeServerUrl.textContent = bridgeBaseUrl;
  }
  if (bridgeServerInput) {
    bridgeServerInput.value = bridgeBaseUrl;
  }
}

async function loadRuntimeConfig() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.runtimeConfig);
  const config = stored[STORAGE_KEYS.runtimeConfig] as BridgeRuntimeConfig | undefined;
  const loadedUrl = config?.bridgeBaseUrl || DEFAULT_BRIDGE_BASE_URL;
  try {
    setBridgeUrl(loadedUrl);
    if (bridgeConfigStatus) {
      bridgeConfigStatus.textContent = config?.bridgeBaseUrl ? "custom override" : "automatic";
    }
  } catch {
    setBridgeUrl(DEFAULT_BRIDGE_BASE_URL);
    if (bridgeConfigStatus) {
      bridgeConfigStatus.textContent = "automatic (saved override ignored)";
    }
  }
}

async function persistRuntimeConfig(url: string) {
  const config: BridgeRuntimeConfig = { bridgeBaseUrl: normalizeBridgeBaseUrl(url) };
  await chrome.storage.local.set({ [STORAGE_KEYS.runtimeConfig]: config });
  setBridgeUrl(config.bridgeBaseUrl);
  if (bridgeConfigStatus) {
    bridgeConfigStatus.textContent = "custom override";
  }
  appendLog(`bridge url saved: ${config.bridgeBaseUrl}`);
}

async function resetRuntimeConfig() {
  await chrome.storage.local.remove(STORAGE_KEYS.runtimeConfig);
  setBridgeUrl(DEFAULT_BRIDGE_BASE_URL);
  if (bridgeConfigStatus) {
    bridgeConfigStatus.textContent = "automatic";
  }
  appendLog(`bridge url reset to default: ${DEFAULT_BRIDGE_BASE_URL}`);
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${bridgeBaseUrl}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

async function postResult(id: string, response: BridgeResponse) {
  await api(`/commands/${encodeURIComponent(id)}/result`, {
    method: "POST",
    body: JSON.stringify(response)
  });
}

async function postHeartbeat(id: string) {
  await api(`/commands/${encodeURIComponent(id)}/heartbeat`, {
    method: "POST",
    body: JSON.stringify({ workerId })
  });
}

async function findTargetTabId(): Promise<number | undefined> {
  const isRunnable = (url?: string) =>
    url != null &&
    !url.startsWith("chrome://") &&
    !url.startsWith("chrome-extension://") &&
    !url.startsWith("devtools://") &&
    !url.startsWith("about:");

  const allActive = await chrome.tabs.query({ active: true });
  const best = allActive
    .filter((t) => isRunnable(t.url))
    .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
  if (best) return best.id;

  const allTabs = await chrome.tabs.query({});
  const fallback = allTabs
    .filter((t) => isRunnable(t.url))
    .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
  return fallback?.id;
}

const NEEDS_TARGET_TAB = new Set(["RUN_SNIPPET", "GET_STATE", "GET_AI_STATE"]);

async function runCommand(command: AgentCommand): Promise<BridgeResponse> {
  if (command.type === "LIST_TABS") {
    return chrome.runtime.sendMessage({ type: "LIST_TABS" } satisfies BridgeRequest) as Promise<BridgeResponse>;
  }
  if (command.type === "OPEN_TAB") {
    return chrome.runtime.sendMessage({ type: "OPEN_TAB", payload: command.payload } satisfies BridgeRequest) as Promise<BridgeResponse>;
  }
  if (command.type === "CLOSE_TAB") {
    return chrome.runtime.sendMessage({ type: "CLOSE_TAB", targetTabId: command.targetTabId } satisfies BridgeRequest) as Promise<BridgeResponse>;
  }

  let targetTabId = command.targetTabId;

  if (!targetTabId && NEEDS_TARGET_TAB.has(command.type)) {
    try {
      targetTabId = await findTargetTabId();
      appendLog(`targetTabId resolved (auto): ${targetTabId}`);
    } catch (error) {
      appendLog(`findTargetTabId error: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else if (targetTabId) {
    appendLog(`targetTabId used (explicit): ${targetTabId}`);
  }

  let request: BridgeRequest;
  if (command.type === "GET_STATE") {
    request = { type: "GET_STATE", targetTabId };
  } else if (command.type === "GET_AI_STATE") {
    request = { type: "GET_AI_STATE", targetTabId };
  } else if (command.type === "OPEN_URL") {
    request = { type: "OPEN_URL", payload: command.payload, targetTabId };
  } else {
    request = { type: "RUN_SNIPPET", payload: command.payload, targetTabId };
  }

  return chrome.runtime.sendMessage(request) as Promise<BridgeResponse>;
}

async function claimNextCommand() {
  const encodedWorkerId = encodeURIComponent(workerId);
  const next = await api<{ command: AgentCommand | null }>(`/commands/claim?workerId=${encodedWorkerId}`);
  return next.command;
}

async function executeClaimedCommand(command: AgentCommand) {
  const heartbeat = window.setInterval(() => {
    void postHeartbeat(command.id).catch((error) => {
      appendLog(`heartbeat failed for ${command.id}: ${error instanceof Error ? error.message : String(error)}`);
    });
  }, 5000);

  try {
    const response = await runCommand(command);
    await postResult(command.id, response);
    if (lastResult) {
      lastResult.textContent = response.ok ? "ok" : response.error;
    }
    appendLog(`completed ${command.id} ok=${response.ok}`);
  } catch (error) {
    const response: BridgeResponse = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
    await postResult(command.id, response);
    if (lastResult) {
      lastResult.textContent = response.error;
    }
    appendLog(`failed ${command.id}: ${response.error}`);
  } finally {
    window.clearInterval(heartbeat);
  }
}

async function pollLoop() {
  if (running || stopped) {
    return;
  }

  running = true;
  appendLog(`poll loop started for ${workerId}`);

  while (!stopped) {
    try {
      setStatus(serverStatus as HTMLElement, "connected", true);
      if (pollStatus) pollStatus.textContent = "polling";

      const command = await claimNextCommand();
      if (!command) {
        if (pollStatus) pollStatus.textContent = "idle";
        await sleep(1000);
        continue;
      }

      if (lastCommand) lastCommand.textContent = `${command.type} ${command.id}`;
      appendLog(`running ${command.type} ${command.id}`);
      await executeClaimedCommand(command);
    } catch (error) {
      setStatus(serverStatus as HTMLElement, "disconnected", false);
      if (pollStatus) pollStatus.textContent = "waiting";
      appendLog(`bridge error: ${error instanceof Error ? error.message : String(error)}`);
      await sleep(1500);
    }
  }
}

window.addEventListener("beforeunload", () => {
  stopped = true;
});

saveBridgeConfigButton?.addEventListener("click", () => {
  void (async () => {
    try {
      await persistRuntimeConfig(bridgeServerInput?.value || bridgeBaseUrl);
    } catch (error) {
      if (bridgeConfigStatus) {
        bridgeConfigStatus.textContent = error instanceof Error ? error.message : String(error);
      }
    }
  })();
});

resetBridgeConfigButton?.addEventListener("click", () => {
  void (async () => {
    try {
      await resetRuntimeConfig();
    } catch (error) {
      if (bridgeConfigStatus) {
        bridgeConfigStatus.textContent = error instanceof Error ? error.message : String(error);
      }
    }
  })();
});

document.title = `${BRIDGE_BROWSER_LABEL} bridge v6`;
if (bridgeInstance) {
  bridgeInstance.textContent = `${BRIDGE_BROWSER_LABEL} [${BRIDGE_INSTANCE}]`;
}
if (workerIdElement) {
  workerIdElement.textContent = workerId;
}

void (async () => {
  await loadRuntimeConfig();
  void pollLoop();
})();
