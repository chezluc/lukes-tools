# General Chrome Console Bridge

Manifest V3 Chrome extension for running JavaScript on target tabs and capturing structured results, logs, and errors through a dedicated `bridge.html` tab.

## How it works

- A dedicated `bridge.html` tab polls the local bridge server for commands
- Background service worker executes snippets via `chrome.debugger`
- Local bridge server at `http://127.0.0.1:4471` queues and returns results
- Supports `RUN_SNIPPET` and `OPEN_URL` commands with background tab reuse

## Development

```bash
npm install
npm run build
```

Load the built `dist` folder as an unpacked extension in Chrome.

## Runtime flow

1. Start the bridge server.
2. Load the unpacked extension from `dist/`.
3. Open `chrome-extension://<EXTENSION_ID>/bridge.html`.
4. Keep that tab open while another agent submits commands to the bridge server.

## Start the server

```bash
cd tools/chrome-console-bridge
npm run bridge
```

## Open the bridge tab

After loading the unpacked extension, open:

```text
chrome-extension://<EXTENSION_ID>/bridge.html
```

Keep that page open. It polls `http://127.0.0.1:4471` for commands and routes them through the extension background runner.

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
