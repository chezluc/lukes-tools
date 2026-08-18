# Chrome Console Bridge v5

Background-first, session-aware bridge for running JavaScript in **real**
Chrome/Canary tabs (your actual profile, your logins) from agents and scripts.

What's new vs v4:

- **Always-on servers.** launchd `KeepAlive` services start both bridge servers
  at login and restart them on crash. There is no startup ritual anymore.
- **Never steals focus.** New tabs open in the background (`active:false`
  everywhere); snippets run via `chrome.scripting` (no debugger banner), with
  automatic fallback to the debugger API on CSP-strict pages. The browser never
  comes to the foreground.
- **Sessions for multi-agent.** `POST /sessions` gives each agent its own
  background tab; commands pinned by `sessionId` can never collide with
  another agent's tab.
- **Long-poll.** `POST /commands?wait=20` returns the completed result in the
  same request — no polling loops.
- **Self-documenting.** `GET /` on either port returns the full API reference
  plus live status.
- **Pinned extension ID.** The extension ID is `hjblaljkbjpecjfcmknipjfnihechjme`
  on every machine, in both browsers, forever. The worker URL never changes.
- **`world: ISOLATED` actually works** (it was silently ignored in v4).
- **MCP facade** (`mcp/server.mjs`) exposing native tools:
  `bridge_status, open_tab, run_js, list_tabs, list_sessions, close_session`.

## One-time setup (per computer)

```bash
cd <this directory>
npm install && npm run build       # build both extension dists
./bin/bridge install               # install + start the always-on servers
```

Then load the unpacked extension (once per browser):

- Canary → `chrome://extensions` → Developer mode → Load unpacked → `dist-canary`
- Chrome → `chrome://extensions` → Developer mode → Load unpacked → `dist-chrome`

The worker tab (`chrome-extension://hjblaljkbjpecjfcmknipjfnihechjme/bridge.html`)
opens itself automatically whenever the browser starts. Done — everything is
now hands-off.

Optional MCP registration for Claude Code:

```bash
claude mcp add chrome-bridge -- node <this directory>/mcp/server.mjs
```

## Daily use

There is nothing to start. Check status any time:

```bash
./bin/bridge status    # both servers, one line each
./bin/bridge doctor    # full diagnosis with exact fixes
```

Agent flow (Canary = `:4471`, Chrome = `:4472`):

```bash
# 1. Is everything ready?  extensionConnected:true = yes.
curl -s http://127.0.0.1:4471/health

# 2. Get your own background tab.
curl -s -X POST http://127.0.0.1:4471/sessions \
  -H 'Content-Type: application/json' \
  -d '{"name":"my-task","url":"https://example.com"}'
# → {"ok":true,"sessionId":"s-1a2b3c4d","tabId":123,...}

# 3. Run JS in YOUR tab; result comes back in the same request.
curl -s -X POST 'http://127.0.0.1:4471/commands?wait=20' \
  -H 'Content-Type: application/json' \
  -d '{"sessionId":"s-1a2b3c4d","type":"RUN_SNIPPET",
       "payload":{"code":"return document.title","world":"MAIN"}}'

# 4. Optional cleanup.
curl -s -X DELETE http://127.0.0.1:4471/sessions/s-1a2b3c4d
```

Full API reference: `curl -s http://127.0.0.1:4471/` (self-documenting).

## Development

```bash
npm run typecheck
npm run build          # rebuild dist-canary + dist-chrome
./bin/bridge logs -f   # follow server logs (~/Library/Logs/chrome-bridge/)
```

The v5 server is backward compatible with the entire v4 API (queue endpoints,
`OPEN_URL`, active-tab targeting), so v4 clients keep working during migration.
