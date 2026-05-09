# General Chrome Console Bridge Startup

This version is bridge-tab only. It does not use a popup or side panel.
Version `v4` runs one queue per browser server and allows multiple bridge worker tabs inside that browser.

## Session checklist

1. Start the local bridge server for each browser you want to control:
   Canary:
   ```bash
   cd /path/to/general-chrome-console-bridge-v4
   env BRIDGE_PORT=4471 BRIDGE_INSTANCE=canary node ./bridge/server.mjs
   ```
   Chrome:
   ```bash
   cd /path/to/general-chrome-console-bridge-v4
   env BRIDGE_PORT=4472 BRIDGE_INSTANCE=chrome node ./bridge/server.mjs
   ```
   If a port is already in use, confirm whether an existing bridge should be reused or restarted.

2. Build the extension when source changes:
   ```bash
   cd /path/to/general-chrome-console-bridge-v4
   npm install
   npm run build
   ```

3. Load the browser-specific unpacked extension:
   Canary:
   ```text
   /path/to/general-chrome-console-bridge-v4/dist-canary
   ```
   Chrome:
   ```text
   /path/to/general-chrome-console-bridge-v4/dist-chrome
   ```

4. Open one or more bridge worker tabs:
   ```text
   chrome-extension://<EXTENSION_ID>/bridge.html
   ```
   In the bridge page:
   - it should already be routed automatically for that browser
   - duplicate the tab if you want more workers in that browser queue
   - use `?worker=radar-1` or `?worker=validate-1` if you want stable worker labels
   - only use the override section if you intentionally want a non-default port

5. Open or focus the target webpage in another tab.

6. Smoke test the bridge:
   ```bash
   curl -X POST http://127.0.0.1:4471/commands \
     -H 'Content-Type: application/json' \
     -d '{
       "type": "RUN_SNIPPET",
       "payload": {
         "code": "return { title: document.title, url: location.href }",
         "world": "MAIN",
         "snippetName": "smoke test"
       }
     }'
   ```
   Then poll:
   ```bash
   curl http://127.0.0.1:4471/commands/<COMMAND_ID>
   ```

## Operational notes

- Prefer `RUN_SNIPPET` as the main execution path.
- Include `targetTabId` when you need to lock execution to a specific tab.
- Multiple bridge worker tabs can run in parallel as long as they target different tabs.
- The bridge tab is internal. It is not the target page.
- Do not open DevTools on a controlled tab while the debugger is attached.
