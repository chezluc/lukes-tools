---
name: chrome-console-bridge-v6
description: Automate live, signed-in Google Chrome or Chrome Canary tabs through the local v6 Windows console bridge without computer use.
---

# Chrome Console Bridge v6 (Windows)

Use the local HTTP bridge to execute JavaScript in the user's real signed-in browser. Canary is `http://127.0.0.1:4471`; Chrome is `http://127.0.0.1:4472`. Always use `127.0.0.1`.

## Readiness and setup

Call `GET /health` first and continue only when `extensionConnected` is `true`. Otherwise run `<BRIDGE_DIR>\bin\bridge.cmd doctor` and follow its diagnosis. Do not improvise foreground browser or computer-use automation.

For setup, run `npm install`, `npm run typecheck`, `npm run build`, and `bin\bridge.cmd install`; then load `dist-canary` or `dist-chrome` from the matching browser's `chrome://extensions`. See `README.md` for complete Windows setup and troubleshooting.

## Required session workflow

1. `POST /sessions` with a short task name and target HTTP(S) URL. Keep its `sessionId`.
2. Send every command to `POST /commands?wait=20` with that ID. Use `RUN_SNIPPET` for DOM work and `OPEN_URL` for navigation.
3. Treat HTTP completion as transport success only. Verify `response.run.ok`, `response.run.error`, and resulting page state.
4. `DELETE /sessions/<sessionId>` when finished unless retaining the background tab materially helps unfinished work.

JavaScript is an async function body: use `return`; `await` is supported. Prefer stable semantic selectors (`name`, label, role, form relationships). Inspect before interacting and verify after navigation/submission.

```powershell
$base = 'http://127.0.0.1:4472'
$session = Invoke-RestMethod -Method Post -Uri "$base/sessions" -ContentType 'application/json' `
  -Body (@{ name='task'; url='https://example.com' } | ConvertTo-Json)
$body = @{
  sessionId = $session.sessionId
  type = 'RUN_SNIPPET'
  payload = @{ code = 'return document.title'; world = 'MAIN' }
} | ConvertTo-Json -Depth 8
Invoke-RestMethod -Method Post -Uri "$base/commands?wait=20" -ContentType 'application/json' -Body $body
```

If a command returns 202, poll `GET /commands/<id>?wait=20`. `GET /` documents all endpoints.

Never use the user's active tab, omit `sessionId`, set `active:true`, call `window.open`, open DevTools, or use computer control. A bridge session does not expand authorization for external account changes.
