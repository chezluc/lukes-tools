---
name: chrome-console-bridge
description: Execute JavaScript in real Chrome tabs via the local bridge (Canary on http://127.0.0.1:4471, Chrome on http://127.0.0.1:4472). Use for DOM inspection, web automation, form filling, and data extraction from live logged-in Chrome tabs. Runs fully in the background — never focuses the browser.
---

# Chrome Console Bridge Skill (v5)

Run JavaScript inside any Chrome tab via a local HTTP bridge + Chrome
extension, using the user's real profile and logins. v5 is session-aware,
long-polling, and background-first. v2/v3/v4 and all other copies are
deprecated.

## The entire startup story

- **Canary:** `http://127.0.0.1:4471` · **Chrome:** `http://127.0.0.1:4472` (always `127.0.0.1`, never `localhost`)
- Servers are **always on** (launchd KeepAlive). Never start them manually.
- `curl -s http://127.0.0.1:4471/health` → `"extensionConnected":true` means **fully operational, nothing to open, nothing to start.**
- If health fails or `extensionConnected` is false: run `<BRIDGE_DIR>/bin/bridge doctor` — it prints the exact fix. The usual fix when the browser isn't running: `open -g -a "Google Chrome Canary"` (`-g` = stay in background).
- Never tell the user to open bridge.html, start servers, or "open the bridge file." The worker tab auto-opens with the extension; the servers auto-start with launchd.

`<BRIDGE_DIR>` = the `general-chrome-console-bridge-v5` directory (in
`.../liz.school.1/tools/` on Luke's machines; resolve via the skill's location
or `~/Library/LaunchAgents/com.chezluc.chrome-bridge-v5.canary.plist`).

## Protocol (3 steps)

### 1. Create YOUR session (a dedicated background tab)

```bash
curl -s -X POST http://127.0.0.1:4471/sessions \
  -H 'Content-Type: application/json' \
  -d '{"name":"<short task name>","url":"https://target.site"}'
# → {"ok":true,"sessionId":"s-XXXX","tabId":123}
```

Always do this. Never target the user's active tab — other agents and the
user share the browser. Sessions are serialized per tab, so any number of
agents can share one bridge without collisions.

### 2. Run commands, pinned to your session, with long-poll

```bash
curl -s -X POST 'http://127.0.0.1:4471/commands?wait=20' \
  -H 'Content-Type: application/json' \
  -d '{"sessionId":"s-XXXX","type":"RUN_SNIPPET",
       "payload":{"code":"return document.title","world":"MAIN"}}'
```

`?wait=20` blocks up to 20s and returns the **completed result in the same
response** (under `response.run`) — no polling loop. If it returns 202, poll
`GET /commands/<id>?wait=20`.

`code` is an async function body: use `return`, `await` is fine.
`world`: `MAIN` = page context (default, sees page globals); `ISOLATED` = sandbox.
Navigation within your session: `{"sessionId":"s-XXXX","type":"OPEN_URL","payload":{"url":"https://next.page"}}` — waits for the load to finish.

### 3. Clean up (optional)

```bash
curl -s -X DELETE http://127.0.0.1:4471/sessions/s-XXXX
```

## Command types

| Type | Notes |
|---|---|
| `RUN_SNIPPET` | `payload {code, world, snippetName?}`. Runs via chrome.scripting (fast, no debug banner); auto-falls back to debugger on CSP-strict pages. |
| `OPEN_URL` | `payload {url, active?:false}` + sessionId/targetTabId. Navigates the tab, waits for load. Background by default. |
| `OPEN_TAB` | `payload {url}` — raw tab creation; prefer `POST /sessions`. |
| `CLOSE_TAB` | needs `targetTabId`. |
| `LIST_TABS` | all http(s) tabs with ids. |
| `GET_AI_STATE` | screenshot + element tree (uses debugger; brief banner). Also `GET /ai-state?sessionId=…` synchronously. |

Discover everything live: `curl -s http://127.0.0.1:4471/` returns the full
API reference with examples.

## Rules

- One session per task/agent; pin everything with `sessionId`.
- Never navigate or run code in a tab you didn't create (no bare commands
  without sessionId/targetTabId unless the user explicitly asked about the
  tab they're looking at).
- Never focus the browser: no `open -a` without `-g`, no `active:true`,
  no `window.open`.
- Don't open DevTools on a controlled tab.
- No rate limit — batch freely.
- MCP alternative: if the `chrome-bridge` MCP tools are available
  (`open_tab`, `run_js`, …), use them instead of curl — same engine.
