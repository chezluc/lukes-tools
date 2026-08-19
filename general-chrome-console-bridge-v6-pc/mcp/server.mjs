#!/usr/bin/env node
// Chrome Console Bridge v6 — MCP facade (stdio).
// Zero dependencies: speaks newline-delimited JSON-RPC per the MCP spec and
// forwards everything to the local bridge HTTP servers (canary :4471,
// chrome :4472), so agents get native tools instead of curl.

import { createInterface } from "node:readline";

const PORTS = { canary: 4471, chrome: 4472 };

function baseUrl(browser) {
  const port = PORTS[browser];
  if (!port) throw new Error(`Unknown browser "${browser}". Use "canary" or "chrome".`);
  return `http://127.0.0.1:${port}`;
}

async function api(browser, path, init) {
  let response;
  try {
    response = await fetch(`${baseUrl(browser)}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
  } catch {
    throw new Error(
      `Bridge server for ${browser} is not reachable on ${baseUrl(browser)}. ` +
      `Run: bridge up   (the launchd service should keep it alive; 'bridge doctor' diagnoses further).`
    );
  }
  return response.json();
}

const browserProp = {
  type: "string",
  enum: ["canary", "chrome"],
  description: "Which browser's bridge to use: canary (Google Chrome Canary) or chrome (Google Chrome).",
};

const TOOLS = [
  {
    name: "bridge_status",
    description: "Check the Chrome Console Bridge health for a browser. extensionConnected:true means the browser+extension are ready — no other setup exists.",
    inputSchema: {
      type: "object",
      properties: { browser: browserProp },
      required: ["browser"],
    },
  },
  {
    name: "open_tab",
    description: "Open a URL in a NEW BACKGROUND tab (never focuses the browser) and get a session that pins all later commands to that tab. Always use this first; each agent/task should own its own session.",
    inputSchema: {
      type: "object",
      properties: {
        browser: browserProp,
        url: { type: "string", description: "http(s) URL to open" },
        name: { type: "string", description: "Optional session label, e.g. the task name" },
      },
      required: ["browser", "url"],
    },
  },
  {
    name: "run_js",
    description: "Run JavaScript in a tab and get the return value plus console logs. `code` is an async function body — use `return`. Runs in the background without focusing the browser. Prefer passing sessionId from open_tab.",
    inputSchema: {
      type: "object",
      properties: {
        browser: browserProp,
        code: { type: "string", description: "Async function body, e.g. `return document.title`" },
        sessionId: { type: "string", description: "Session from open_tab (preferred)" },
        tabId: { type: "number", description: "Explicit tab id (alternative to sessionId)" },
        world: { type: "string", enum: ["MAIN", "ISOLATED"], description: "JS world; MAIN (default) sees page globals" },
      },
      required: ["browser", "code"],
    },
  },
  {
    name: "list_tabs",
    description: "List all open http(s) tabs in the browser with their tab ids, titles, and URLs.",
    inputSchema: {
      type: "object",
      properties: { browser: browserProp },
      required: ["browser"],
    },
  },
  {
    name: "list_sessions",
    description: "List active bridge sessions (agent-owned tabs) for a browser.",
    inputSchema: {
      type: "object",
      properties: { browser: browserProp },
      required: ["browser"],
    },
  },
  {
    name: "close_session",
    description: "Close a session's tab and forget the session.",
    inputSchema: {
      type: "object",
      properties: {
        browser: browserProp,
        sessionId: { type: "string" },
      },
      required: ["browser", "sessionId"],
    },
  },
];

async function callTool(name, args) {
  const browser = args.browser;
  switch (name) {
    case "bridge_status":
      return api(browser, "/health");
    case "open_tab":
      return api(browser, "/sessions", {
        method: "POST",
        body: JSON.stringify({ name: args.name, url: args.url }),
      });
    case "run_js": {
      const body = {
        type: "RUN_SNIPPET",
        payload: { code: args.code, world: args.world || "MAIN", snippetName: "mcp run_js" },
      };
      if (args.sessionId) body.sessionId = args.sessionId;
      if (args.tabId) body.targetTabId = args.tabId;
      const result = await api(browser, "/commands?wait=30", { method: "POST", body: JSON.stringify(body) });
      if (result.status && result.status !== "completed") {
        return result; // timed out note with next steps
      }
      const run = result.response?.run;
      return run
        ? { ok: result.response.ok, result: run.result, logs: run.logs, error: run.error, tabId: run.tabId, url: run.url, executor: run.executor }
        : result.response ?? result;
    }
    case "list_tabs": {
      const result = await api(browser, "/commands?wait=15", {
        method: "POST",
        body: JSON.stringify({ type: "LIST_TABS" }),
      });
      return result.response?.tabs ? { ok: true, tabs: result.response.tabs } : result;
    }
    case "list_sessions":
      return api(browser, "/sessions");
    case "close_session":
      return api(browser, `/sessions/${encodeURIComponent(args.sessionId)}`, { method: "DELETE" });
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function reply(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function replyError(id, message) {
  send({ jsonrpc: "2.0", id, error: { code: -32000, message } });
}

const rl = createInterface({ input: process.stdin });

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let message;
  try {
    message = JSON.parse(trimmed);
  } catch {
    return;
  }
  void handle(message);
});

async function handle(message) {
  const { id, method, params } = message;
  try {
    if (method === "initialize") {
      return reply(id, {
        protocolVersion: params?.protocolVersion || "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "chrome-bridge-v6", version: "0.6.0" },
      });
    }
    if (method === "notifications/initialized" || method === "notifications/cancelled") {
      return;
    }
    if (method === "ping") {
      return reply(id, {});
    }
    if (method === "tools/list") {
      return reply(id, { tools: TOOLS });
    }
    if (method === "tools/call") {
      const { name, arguments: args } = params;
      try {
        const result = await callTool(name, args || {});
        return reply(id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
      } catch (error) {
        return reply(id, {
          content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
          isError: true,
        });
      }
    }
    if (id !== undefined) {
      return replyError(id, `Method not supported: ${method}`);
    }
  } catch (error) {
    if (id !== undefined) {
      replyError(id, error instanceof Error ? error.message : String(error));
    }
  }
}
