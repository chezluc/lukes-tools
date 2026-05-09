# General Chrome Console Bridge

Manifest V3 Chrome extension for running JavaScript on target tabs and capturing structured results, logs, and errors through a dedicated `bridge.html` tab.

## What v4 is

- No popup
- No side panel
- One queue per browser bridge server
- Multiple `bridge.html` worker tabs can share the same browser queue
- Commands lock on `targetTabId`, so two workers can run in parallel on different tabs without colliding
- Worker leases expire and requeue if a worker tab dies
- Browser-local bridge URL config stored in extension storage, so the same unpacked extension can be loaded in both Canary and Chrome and pointed at different local bridge ports

## Development

```bash
npm install
npm run build
```

Load the browser-specific unpacked folder:

- Canary: `dist-canary`
- Chrome: `dist-chrome`

## Runtime flow

1. Start one bridge server per browser.
2. Load the unpacked extension from the matching browser folder.
3. Open `chrome-extension://<EXTENSION_ID>/bridge.html`.
4. Let it use the built-in browser-specific default bridge URL.
5. Duplicate the `bridge.html` tab when you want more workers in that browser.
6. Keep worker tabs open while another agent submits commands to that browser's queue.

## Start servers

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

## Worker tabs

After loading the unpacked extension, open:

```text
chrome-extension://<EXTENSION_ID>/bridge.html
```

Then:

- In Canary, the default route is `http://127.0.0.1:4471`
- In Chrome, the default route is `http://127.0.0.1:4472`
- Duplicate the page to create more workers for that browser queue
- Only use the override section if you intentionally want a non-default bridge URL

Example worker URLs:

```text
chrome-extension://<EXTENSION_ID>/bridge.html?worker=radar-1
chrome-extension://<EXTENSION_ID>/bridge.html?worker=validate-1
chrome-extension://<EXTENSION_ID>/bridge.html?worker=validate-2
```

## Queue endpoints

Health:

```bash
curl http://127.0.0.1:4471/health
```

Run a snippet:

```bash
curl -X POST http://127.0.0.1:4471/commands \
  -H 'Content-Type: application/json' \
  -d '{
    "type": "RUN_SNIPPET",
    "payload": {
      "code": "return document.title",
      "world": "ISOLATED",
      "snippetName": "title check"
    }
  }'
```

Fetch the result:

```bash
curl http://127.0.0.1:4471/commands/<COMMAND_ID>
```

Claim the next command as a worker:

```bash
curl "http://127.0.0.1:4471/commands/claim?workerId=test-worker"
```
