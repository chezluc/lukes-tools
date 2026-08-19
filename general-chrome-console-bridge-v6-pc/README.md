# Chrome Console Bridge v6 for Windows

This extension and local Node.js bridge let a Codex/ChatGPT agent run JavaScript in dedicated background tabs in the user's real Chrome or Chrome Canary profile. Older bridge directories remain independent and are not removed or replaced.

| Browser | Local URL | Unpacked extension |
|---|---|---|
| Chrome Canary | `http://127.0.0.1:4471` | `dist-canary` |
| Google Chrome | `http://127.0.0.1:4472` | `dist-chrome` |

Always use `127.0.0.1`, not `localhost`. The committed `dist-*` folders are ready to load.

## One-time Windows setup

Prerequisites: Windows 10/11, Chrome and/or Chrome Canary, Node.js LTS (with npm), and PowerShell 5.1 or newer.

```powershell
cd '<path-to>\general-chrome-console-bridge-v6-pc'
npm install
npm run typecheck
npm run build
.\bin\bridge.cmd install
```

`install` starts both servers and adds per-user Startup launchers; administrator access is not required. Logs go to `%LOCALAPPDATA%\ChromeConsoleBridgeV6`.

Load each desired extension once:

1. Open `chrome://extensions` in that browser and enable **Developer mode**.
2. Select **Load unpacked**.
3. For Canary choose this project's `dist-canary`; for Chrome choose `dist-chrome`.
4. Leave **Chrome Console Bridge v6** enabled. Its background worker opens its bridge page automatically.

After rebuilding, select **Reload** on each extension card. Each dist points to its browser-specific port; do not swap them.

## Verify and manage

```powershell
.\bin\bridge.cmd status
.\bin\bridge.cmd doctor
Invoke-RestMethod http://127.0.0.1:4471/health # Canary
Invoke-RestMethod http://127.0.0.1:4472/health # Chrome
```

The bridge is ready only when `/health` reports `ok: true` and `extensionConnected: true`. Other commands are `up`, `down`, `logs`, and `uninstall`. Uninstall affects only v6 startup launchers/processes, never older versions or keys.

## Required agent workflow (no computer use)

Use PowerShell HTTP requests only—no mouse/keyboard automation, foreground browser control, DevTools, `active:true`, or unpinned commands.

```powershell
$base = 'http://127.0.0.1:4472' # Chrome; use :4471 for Canary
$health = Invoke-RestMethod "$base/health"
if (-not $health.extensionConnected) { throw 'Run .\bin\bridge.cmd doctor' }

$session = Invoke-RestMethod -Method Post -Uri "$base/sessions" `
  -ContentType 'application/json' `
  -Body (@{ name = 'short-task-name'; url = 'https://example.com' } | ConvertTo-Json)

$body = @{
  sessionId = $session.sessionId
  type = 'RUN_SNIPPET'
  payload = @{ code = 'return { title: document.title, url: location.href }'; world = 'MAIN' }
} | ConvertTo-Json -Depth 8
$result = Invoke-RestMethod -Method Post -Uri "$base/commands?wait=20" `
  -ContentType 'application/json' -Body $body

Invoke-RestMethod -Method Delete -Uri "$base/sessions/$($session.sessionId)"
```

Create one session per agent/task and include its `sessionId` in every command. Inspect the DOM before interacting. After navigation or submission, verify `response.run.ok`, `response.run.error`, the URL, alerts, and relevant text before reporting success. JavaScript is an async function body, so use `return` and `await`. Use `OPEN_URL` through the same session for navigation. If long-poll returns HTTP 202, poll `GET /commands/<id>?wait=20`. `GET /` is the live API reference.

Normal authorization boundaries still apply: a signed-in session does not authorize purchases, messages, publishing, deletion, or other external mutations.

## Troubleshooting

- Server down: run `.\bin\bridge.cmd up`, then `.\bin\bridge.cmd logs`; verify Node is on `PATH` and no other program owns 4471/4472.
- `extensionConnected: false`: start the matching browser, enable/reload v6 at `chrome://extensions`, and confirm the correct `dist-*` was loaded.
- Moved project directory: rerun `.\bin\bridge.cmd install` to update Startup launchers.
- Repeated 202/queued command: check `/health`; no worker means the browser/extension is unavailable.
- Session not found: sessions reset when a server restarts; create a new one.
- CSP-strict page: `RUN_SNIPPET` falls back to the debugger API and may briefly show Chrome's debugging banner.

For development run `npm run typecheck` and `npm run build`. The optional MCP facade is `node .\mcp\server.mjs` and exposes `bridge_status`, `open_tab`, `run_js`, `list_tabs`, `list_sessions`, and `close_session`.
