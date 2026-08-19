// src/shared/constants.ts
var STORAGE_KEYS = {
  history: "runHistory",
  runtimeConfig: "bridgeRuntimeConfig"
};

// src/shared/runtime-config.ts
var DEFAULT_BRIDGE_BASE_URL = "http://127.0.0.1:4471";
var BRIDGE_INSTANCE = "canary";
var BRIDGE_BROWSER_LABEL = "Google Chrome Canary";

// src/bridge/index.ts
var serverStatus = document.getElementById("serverStatus");
var pollStatus = document.getElementById("pollStatus");
var lastCommand = document.getElementById("lastCommand");
var lastResult = document.getElementById("lastResult");
var logOutput = document.getElementById("logOutput");
var bridgeInstance = document.getElementById("bridgeInstance");
var bridgeServerUrl = document.getElementById("bridgeServerUrl");
var bridgeServerInput = document.getElementById("bridgeServerInput");
var bridgeConfigStatus = document.getElementById("bridgeConfigStatus");
var saveBridgeConfigButton = document.getElementById("saveBridgeConfig");
var resetBridgeConfigButton = document.getElementById("resetBridgeConfig");
var workerIdElement = document.getElementById("workerId");
var running = false;
var stopped = false;
var bridgeBaseUrl = DEFAULT_BRIDGE_BASE_URL;
function setStatus(element, text, ok = false) {
  if (!element) return;
  element.textContent = text;
  element.classList.toggle("ok", ok);
  element.classList.toggle("bad", !ok);
}
function appendLog(message) {
  const time = (/* @__PURE__ */ new Date()).toISOString();
  console.log(`[Bridge] ${time} ${message}`);
  if (logOutput) {
    logOutput.textContent = `${time} ${message}
${logOutput.textContent}`.trim().slice(0, 2e4);
  }
}
function sleep(ms) {
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
var workerId = getWorkerId();
function normalizeBridgeBaseUrl(value) {
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
function setBridgeUrl(url) {
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
  const config = stored[STORAGE_KEYS.runtimeConfig];
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
async function persistRuntimeConfig(url) {
  const config = { bridgeBaseUrl: normalizeBridgeBaseUrl(url) };
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
async function api(path, init) {
  const response = await fetch(`${bridgeBaseUrl}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...init?.headers ?? {}
    },
    ...init
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  return response.json();
}
async function postResult(id, response) {
  await api(`/commands/${encodeURIComponent(id)}/result`, {
    method: "POST",
    body: JSON.stringify(response)
  });
}
async function postHeartbeat(id) {
  await api(`/commands/${encodeURIComponent(id)}/heartbeat`, {
    method: "POST",
    body: JSON.stringify({ workerId })
  });
}
async function findTargetTabId() {
  const isRunnable = (url) => url != null && !url.startsWith("chrome://") && !url.startsWith("chrome-extension://") && !url.startsWith("devtools://") && !url.startsWith("about:");
  const allActive = await chrome.tabs.query({ active: true });
  const best = allActive.filter((t) => isRunnable(t.url)).sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
  if (best) return best.id;
  const allTabs = await chrome.tabs.query({});
  const fallback = allTabs.filter((t) => isRunnable(t.url)).sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
  return fallback?.id;
}
var NEEDS_TARGET_TAB = /* @__PURE__ */ new Set(["RUN_SNIPPET", "GET_STATE", "GET_AI_STATE"]);
async function runCommand(command) {
  if (command.type === "LIST_TABS") {
    return chrome.runtime.sendMessage({ type: "LIST_TABS" });
  }
  if (command.type === "OPEN_TAB") {
    return chrome.runtime.sendMessage({ type: "OPEN_TAB", payload: command.payload });
  }
  if (command.type === "CLOSE_TAB") {
    return chrome.runtime.sendMessage({ type: "CLOSE_TAB", targetTabId: command.targetTabId });
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
  let request;
  if (command.type === "GET_STATE") {
    request = { type: "GET_STATE", targetTabId };
  } else if (command.type === "GET_AI_STATE") {
    request = { type: "GET_AI_STATE", targetTabId };
  } else if (command.type === "OPEN_URL") {
    request = { type: "OPEN_URL", payload: command.payload, targetTabId };
  } else {
    request = { type: "RUN_SNIPPET", payload: command.payload, targetTabId };
  }
  return chrome.runtime.sendMessage(request);
}
async function claimNextCommand() {
  const encodedWorkerId = encodeURIComponent(workerId);
  const next = await api(`/commands/claim?workerId=${encodedWorkerId}`);
  return next.command;
}
async function executeClaimedCommand(command) {
  const heartbeat = window.setInterval(() => {
    void postHeartbeat(command.id).catch((error) => {
      appendLog(`heartbeat failed for ${command.id}: ${error instanceof Error ? error.message : String(error)}`);
    });
  }, 5e3);
  try {
    const response = await runCommand(command);
    await postResult(command.id, response);
    if (lastResult) {
      lastResult.textContent = response.ok ? "ok" : response.error;
    }
    appendLog(`completed ${command.id} ok=${response.ok}`);
  } catch (error) {
    const response = {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
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
      setStatus(serverStatus, "connected", true);
      if (pollStatus) pollStatus.textContent = "polling";
      const command = await claimNextCommand();
      if (!command) {
        if (pollStatus) pollStatus.textContent = "idle";
        await sleep(1e3);
        continue;
      }
      if (lastCommand) lastCommand.textContent = `${command.type} ${command.id}`;
      appendLog(`running ${command.type} ${command.id}`);
      await executeClaimedCommand(command);
    } catch (error) {
      setStatus(serverStatus, "disconnected", false);
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
