import { HISTORY_LIMIT, STORAGE_KEYS } from "../shared/constants";
import type { BridgeRequest, BridgeResponse } from "../shared/messages";
import type {
  CapturedLog,
  ExecutionWorld,
  ExtensionState,
  RunResultEnvelope,
  SerializedError,
  TabSummary,
} from "../shared/types";
import { collectAIState } from "./ai-state-collector";

const AUTO_WORKER_QUERY = "?worker=auto-1";
let ensureBridgeTabPromise: Promise<chrome.tabs.Tab | null> | null = null;

chrome.runtime.onInstalled.addListener(() => {
  void ensureBridgeTab();
});

chrome.runtime.onStartup.addListener(() => {
  void ensureBridgeTab();
});

chrome.tabs.onRemoved.addListener(() => {
  void ensureBridgeTab();
});

function bridgeTabPatterns() {
  const bridgeUrl = chrome.runtime.getURL("bridge.html");
  return [bridgeUrl, `${bridgeUrl}*`];
}

function autoBridgeTabUrl() {
  return `${chrome.runtime.getURL("bridge.html")}${AUTO_WORKER_QUERY}`;
}

async function ensureBridgeTab() {
  if (ensureBridgeTabPromise) {
    return ensureBridgeTabPromise;
  }

  ensureBridgeTabPromise = (async () => {
    const tabs = await chrome.tabs.query({ url: bridgeTabPatterns() });
    if (tabs.length > 0) {
      return tabs[0] ?? null;
    }

    try {
      return await chrome.tabs.create({ url: autoBridgeTabUrl(), active: false });
    } catch (error) {
      console.error("[Background] Failed to create bridge tab:", error);
      return null;
    } finally {
      ensureBridgeTabPromise = null;
    }
  })();

  return ensureBridgeTabPromise;
}

chrome.runtime.onMessage.addListener((message: BridgeRequest, _sender, sendResponse) => {
  void ensureBridgeTab();
  void executeBridgeRequest(message).then(sendResponse);
  return true;
});

async function executeBridgeRequest(message: BridgeRequest): Promise<BridgeResponse> {
  try {
    switch (message.type) {
      case "GET_STATE":
        return { ok: true, state: await getExtensionState(message.targetTabId) };
      case "LIST_TABS":
        return { ok: true, tabs: await listRunnableTabs() };
      case "GET_AI_STATE": {
        const tab = message.targetTabId ? await chrome.tabs.get(message.targetTabId) : await getActiveTab();
        if (!tab.id) throw new Error("No active tab.");
        const aiState = await collectAIState(tab.id);
        return { ok: true, aiState };
      }
      case "OPEN_TAB":
        return { ok: true, run: await openTab(message.payload) };
      case "OPEN_URL":
        return { ok: true, run: await openUrl(message.payload.url, message.payload.active, message.targetTabId) };
      case "CLOSE_TAB":
        return { ok: true, run: await closeTab(message.targetTabId) };
      case "RUN_SNIPPET":
        return { ok: true, run: await runSnippet(message.payload.code, message.payload.world, message.payload.snippetName, message.targetTabId) };
      default:
        return { ok: false, error: `Unknown message type: ${(message as { type?: string }).type}` };
    }
  } catch (error) {
    return { ok: false, error: getErrorMessage(error) };
  }
}

async function getExtensionState(targetTabId?: number): Promise<ExtensionState> {
  const tab = targetTabId ? await chrome.tabs.get(targetTabId) : await getActiveTab();
  const stored = await chrome.storage.local.get(STORAGE_KEYS.history);
  return {
    currentUrl: tab.url ?? "Unavailable",
    history: normalizeHistory(stored[STORAGE_KEYS.history]),
  };
}

function isRunnableTabUrl(url?: string): boolean {
  return url != null &&
    !url.startsWith("chrome://") &&
    !url.startsWith("chrome-extension://") &&
    !url.startsWith("devtools://") &&
    !url.startsWith("about:");
}

function toTabSummary(tab: chrome.tabs.Tab): TabSummary | null {
  if (!tab.id || !isRunnableTabUrl(tab.url)) {
    return null;
  }
  return {
    id: tab.id,
    windowId: tab.windowId,
    active: Boolean(tab.active),
    title: tab.title ?? "",
    url: tab.url ?? "",
    lastAccessed: tab.lastAccessed,
  };
}

async function listRunnableTabs(): Promise<TabSummary[]> {
  const tabs = await chrome.tabs.query({});
  return tabs
    .map(toTabSummary)
    .filter((tab): tab is TabSummary => Boolean(tab))
    .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
}

// ---------------------------------------------------------------------------
// Tab management — background-first: nothing here ever focuses a window.
// ---------------------------------------------------------------------------

function waitForTabComplete(tabId: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const listener = (updatedTabId: number, changeInfo: { status?: string }) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        cleanup();
        resolve();
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, timeoutMs);
    function cleanup() {
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
    }
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then(
      (tab) => {
        if (tab.status === "complete") {
          cleanup();
          resolve();
        }
      },
      () => {
        cleanup();
        resolve();
      }
    );
  });
}

async function openTab(payload: { url: string; active?: boolean; waitMs?: number }): Promise<RunResultEnvelope> {
  if (!payload.url || !/^https?:/i.test(payload.url)) {
    throw new Error("OPEN_TAB requires an http/https URL.");
  }
  const startedAt = Date.now();
  const tab = await chrome.tabs.create({ url: payload.url, active: payload.active ?? false });
  if (!tab.id) {
    throw new Error("Could not create tab.");
  }
  await waitForTabComplete(tab.id, payload.waitMs ?? 20000);
  const fresh = await chrome.tabs.get(tab.id);

  const envelope: RunResultEnvelope = {
    ok: true,
    tabId: tab.id,
    url: fresh.url ?? payload.url,
    durationMs: Date.now() - startedAt,
    result: { tabId: tab.id, url: fresh.url, title: fresh.title, status: fresh.status },
    logs: [],
    error: null,
    ranAt: new Date().toISOString(),
    world: "MAIN",
    executor: "tabs",
    snippetName: "open tab",
    code: `OPEN_TAB ${payload.url}`,
  };
  await appendHistory(envelope);
  return envelope;
}

async function openUrl(url: string, active = false, targetTabId?: number): Promise<RunResultEnvelope> {
  if (!url || !/^https?:/i.test(url)) {
    throw new Error("OPEN_URL requires an http/https URL.");
  }

  const startedAt = Date.now();
  const tab = targetTabId
    ? await chrome.tabs.update(targetTabId, { url, active })
    : await chrome.tabs.create({ url, active });

  if (!tab?.id) {
    throw new Error("Could not open or update target tab.");
  }
  await waitForTabComplete(tab.id, 20000);
  const fresh = await chrome.tabs.get(tab.id);

  const envelope: RunResultEnvelope = {
    ok: true,
    tabId: tab.id,
    url: fresh.url ?? url,
    durationMs: Date.now() - startedAt,
    result: { openedUrl: url, tabId: tab.id, title: fresh.title },
    logs: [],
    error: null,
    ranAt: new Date().toISOString(),
    world: "MAIN",
    executor: "tabs",
    snippetName: "open url",
    code: `OPEN_URL ${url}`,
  };

  await appendHistory(envelope);
  return envelope;
}

async function closeTab(targetTabId: number): Promise<RunResultEnvelope> {
  const startedAt = Date.now();
  await chrome.tabs.remove(targetTabId);
  return {
    ok: true,
    tabId: targetTabId,
    url: "",
    durationMs: Date.now() - startedAt,
    result: { closedTabId: targetTabId },
    logs: [],
    error: null,
    ranAt: new Date().toISOString(),
    world: "MAIN",
    executor: "tabs",
    snippetName: "close tab",
    code: `CLOSE_TAB ${targetTabId}`,
  };
}

// ---------------------------------------------------------------------------
// Snippet execution.
// Primary path: chrome.scripting.executeScript — fast, honors MAIN/ISOLATED,
// no debugger banner, works in background tabs of unfocused windows.
// Fallback path: chrome.debugger Runtime.evaluate — for pages whose CSP
// blocks eval in the requested world.
// ---------------------------------------------------------------------------

interface SnippetPayload {
  ok: boolean;
  result: unknown;
  logs: CapturedLog[];
  error: SerializedError | null;
}

type PageRunnerOutcome = SnippetPayload | { __cspBlocked: true; message: string };

// Serialized into the target page by chrome.scripting — must stay fully
// self-contained (no references to anything outside this function).
function pageRunner(code: string): Promise<PageRunnerOutcome> {
  return (async () => {
    const logs: CapturedLog[] = [];
    const original = { log: console.log, warn: console.warn, error: console.error };

    const serialize = (value: unknown, seen = new WeakSet()): unknown => {
      if (value === null || value === undefined) return value ?? null;
      const valueType = typeof value;
      if (valueType === "string" || valueType === "number" || valueType === "boolean") return value;
      if (valueType === "bigint") return { __type: "bigint", value: String(value) };
      if (valueType === "function") return { __type: "function", value: (value as { name?: string }).name || "anonymous" };
      if (valueType === "symbol") return { __type: "symbol", value: String(value) };
      if (value instanceof Error) return { __type: "error", name: value.name, message: value.message, stack: value.stack };
      if (typeof Element !== "undefined" && value instanceof Element) {
        return { __type: "element", tagName: value.tagName, id: value.id, className: value.className, text: value.textContent?.slice(0, 200) ?? "" };
      }
      if (typeof NodeList !== "undefined" && (value instanceof NodeList || value instanceof HTMLCollection)) {
        return Array.from(value as ArrayLike<unknown>).map((item) => serialize(item, seen));
      }
      if (Array.isArray(value)) return value.map((item) => serialize(item, seen));
      if (value instanceof Map) return { __type: "map", entries: Array.from(value.entries()).map(([key, entryValue]) => [serialize(key, seen), serialize(entryValue, seen)]) };
      if (value instanceof Set) return { __type: "set", values: Array.from(value.values()).map((item) => serialize(item, seen)) };
      if (value instanceof Date) return { __type: "date", value: value.toISOString() };
      if (typeof value === "object") {
        if (seen.has(value as object)) return { __type: "circular" };
        seen.add(value as object);
        const entries = Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [key, serialize(entryValue, seen)]);
        seen.delete(value as object);
        return Object.fromEntries(entries);
      }
      return { __type: "unserializable", value: String(value) };
    };

    const stringifyArgs = (args: unknown[]) =>
      args
        .map((arg) => {
          try {
            const serialized = serialize(arg);
            return typeof serialized === "string" ? serialized : JSON.stringify(serialized);
          } catch {
            return "[unserializable]";
          }
        })
        .join(" ");

    (["log", "warn", "error"] as const).forEach((method) => {
      console[method] = (...args: unknown[]) => {
        logs.push({
          level: method,
          args: serialize(args) as unknown[],
          text: stringifyArgs(args),
          at: new Date().toISOString(),
        });
        original[method](...args);
      };
    });

    try {
      let fn: () => Promise<unknown>;
      try {
        fn = new Function(`return (async () => { ${code} })();`) as () => Promise<unknown>;
      } catch (error) {
        return { __cspBlocked: true, message: error instanceof Error ? error.message : String(error) };
      }
      const value = await fn();
      return { ok: true, result: serialize(value), logs, error: null };
    } catch (error) {
      return {
        ok: false,
        result: null,
        logs,
        error: {
          name: error instanceof Error ? error.name : "Error",
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      };
    } finally {
      console.log = original.log;
      console.warn = original.warn;
      console.error = original.error;
    }
  })();
}

async function executeViaScripting(tabId: number, code: string, world: ExecutionWorld): Promise<SnippetPayload | null> {
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    world,
    func: pageRunner,
    args: [code],
  });

  const payload = injection?.result as PageRunnerOutcome | undefined;
  if (!payload) {
    throw new Error("executeScript returned no result.");
  }
  if ("__cspBlocked" in payload) {
    return null;
  }
  return payload;
}

async function runSnippet(code: string, world: ExecutionWorld, snippetName?: string, targetTabId?: number): Promise<RunResultEnvelope> {
  if (!code.trim()) {
    throw new Error("Snippet is empty.");
  }

  const tab = targetTabId
    ? await chrome.tabs.get(targetTabId)
    : await getActiveTab();
  if (!tab.id) {
    throw new Error("No active tab is available.");
  }

  const startedAt = Date.now();
  let payload: SnippetPayload | null = null;
  let executor: "scripting" | "debugger" = "scripting";

  try {
    payload = await executeViaScripting(tab.id, code, world ?? "MAIN");
  } catch (error) {
    const message = getErrorMessage(error);
    if (!/cannot access|cannot be scripted|showing error page|no tab with id/i.test(message)) {
      payload = null; // unexpected scripting failure — try the debugger path
    } else {
      throw error;
    }
  }

  if (!payload) {
    executor = "debugger";
    payload = await evaluateSnippetWithDebugger(tab.id, code);
  }

  const envelope: RunResultEnvelope = {
    ok: payload.ok,
    tabId: tab.id,
    url: tab.url ?? "Unavailable",
    durationMs: Date.now() - startedAt,
    result: payload.result,
    logs: payload.logs ?? [],
    error: payload.error ?? null,
    ranAt: new Date().toISOString(),
    world,
    executor,
    snippetName,
    code
  };

  await appendHistory(envelope);
  return envelope;
}

async function evaluateSnippetWithDebugger(tabId: number, code: string): Promise<SnippetPayload> {
  const debuggee = { tabId };
  const expression = `
    (async () => {
      const logs = [];
      const methods = ["log", "warn", "error"];
      const originalConsole = {
        log: console.log,
        warn: console.warn,
        error: console.error
      };

      const serialize = (value, seen = new WeakSet()) => {
        if (value === null || value === undefined) return value ?? null;
        const valueType = typeof value;
        if (valueType === "string" || valueType === "number" || valueType === "boolean") return value;
        if (valueType === "bigint") return { __type: "bigint", value: String(value) };
        if (valueType === "function") return { __type: "function", value: value.name || "anonymous" };
        if (valueType === "symbol") return { __type: "symbol", value: String(value) };
        if (value instanceof Error) return { __type: "error", name: value.name, message: value.message, stack: value.stack };
        if (value instanceof Element) return { __type: "element", tagName: value.tagName, id: value.id, className: value.className, text: value.textContent?.slice(0, 200) ?? "" };
        if (value instanceof NodeList || value instanceof HTMLCollection) return Array.from(value).map((item) => serialize(item, seen));
        if (Array.isArray(value)) return value.map((item) => serialize(item, seen));
        if (value instanceof Map) return { __type: "map", entries: Array.from(value.entries()).map(([key, entryValue]) => [serialize(key, seen), serialize(entryValue, seen)]) };
        if (value instanceof Set) return { __type: "set", values: Array.from(value.values()).map((item) => serialize(item, seen)) };
        if (value instanceof Date) return { __type: "date", value: value.toISOString() };
        if (typeof value === "object") {
          if (seen.has(value)) return { __type: "circular" };
          seen.add(value);
          const entries = Object.entries(value).map(([key, entryValue]) => [key, serialize(entryValue, seen)]);
          seen.delete(value);
          return Object.fromEntries(entries);
        }
        return { __type: "unserializable", value: String(value) };
      };

      const stringifyArgs = (args) =>
        args
          .map((arg) => {
            try {
              const serialized = serialize(arg);
              return typeof serialized === "string" ? serialized : JSON.stringify(serialized);
            } catch {
              return "[unserializable]";
            }
          })
          .join(" ");

      for (const method of methods) {
        console[method] = (...args) => {
          logs.push({
            level: method,
            args: serialize(args),
            text: stringifyArgs(args),
            at: new Date().toISOString()
          });
          originalConsole[method](...args);
        };
      }

      try {
        const value = await (async () => { ${code} })();
        return JSON.stringify({ ok: true, result: serialize(value), logs, error: null });
      } catch (error) {
        return JSON.stringify({
          ok: false,
          result: null,
          logs,
          error: {
            name: error instanceof Error ? error.name : "Error",
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
          }
        });
      } finally {
        console.log = originalConsole.log;
        console.warn = originalConsole.warn;
        console.error = originalConsole.error;
      }
    })();
  `;

  await chrome.debugger.attach(debuggee, "1.3");

  try {
    const response = await chrome.debugger.sendCommand(debuggee, "Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true
    }) as { result?: { value?: string }; exceptionDetails?: { text?: string } };

    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.text || "Runtime.evaluate failed");
    }

    const raw = response.result?.value;
    if (!raw || typeof raw !== "string") {
      throw new Error("Snippet evaluation returned no payload");
    }

    return JSON.parse(raw) as SnippetPayload;
  } finally {
    try {
      await chrome.debugger.detach(debuggee);
    } catch {
      // Ignore detach failures if Chrome already released the session.
    }
  }
}

async function appendHistory(run: RunResultEnvelope): Promise<void> {
  const current = await chrome.storage.local.get(STORAGE_KEYS.history);
  const history = normalizeHistory(current[STORAGE_KEYS.history]);
  const next = [summarizeRunForHistory(run), ...history].slice(0, HISTORY_LIMIT);
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.history]: next });
  } catch (error) {
    const message = getErrorMessage(error);
    if (!/quota/i.test(message)) {
      throw error;
    }

    const compact = next.slice(0, Math.min(10, next.length)).map((entry) => ({
      ...entry,
      result: typeof entry.result === "string" ? entry.result.slice(0, 500) : { __truncated: true },
      logs: (entry.logs || []).slice(0, 3),
      code: entry.code.slice(0, 200),
    }));
    await chrome.storage.local.set({ [STORAGE_KEYS.history]: compact });
  }
}

function summarizeRunForHistory(run: RunResultEnvelope): RunResultEnvelope {
  const previewText = (value: unknown, max = 400) => {
    const raw = typeof value === "string" ? value : JSON.stringify(value);
    return raw.length > max ? `${raw.slice(0, max)}…` : raw;
  };

  const summarizeResult = (value: unknown): unknown => {
    if (typeof value === "string") {
      return value.length > 2000 ? `${value.slice(0, 2000)}…` : value;
    }
    try {
      const raw = JSON.stringify(value);
      if (!raw) return value;
      if (raw.length <= 2000) return value;
      return {
        __truncated: true,
        preview: `${raw.slice(0, 2000)}…`,
      };
    } catch {
      return { __truncated: true, preview: previewText(value, 2000) };
    }
  };

  return {
    ...run,
    code: run.code.length > 600 ? `${run.code.slice(0, 600)}…` : run.code,
    result: summarizeResult(run.result),
    logs: (run.logs || []).slice(0, 10).map((entry) => ({
      ...entry,
      text: entry.text.length > 500 ? `${entry.text.slice(0, 500)}…` : entry.text,
    })),
  };
}

async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const httpTabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"], active: true });
  const best = httpTabs.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
  if (best) return best;

  const allHttp = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  const fallback = allHttp.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];

  if (!fallback) {
    throw new Error("No runnable web tab found. Use OPEN_TAB (or POST /sessions) to create one in the background.");
  }

  return fallback;
}

function normalizeHistory(value: unknown): RunResultEnvelope[] {
  return Array.isArray(value) ? (value as RunResultEnvelope[]) : [];
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
