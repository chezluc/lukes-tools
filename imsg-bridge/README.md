# imsg-bridge

A lightweight macOS menu bar app that exposes a localhost HTTP API for sending and reading iMessages. Other programs can interact with iMessage through this API without needing Full Disk Access themselves — only `imsg-bridge` needs it.

## Why

Every app that wants to read or send iMessages needs Full Disk Access to `~/Library/Messages/chat.db`. This tool acts as a bridge: it runs in your menu bar with FDA, and other tools (scripts, agents, automations) just hit a local HTTP endpoint.

## Requirements

- macOS 13+
- [imsg](https://github.com/steipete/imsg) CLI installed (`brew install steipete/tap/imsg`)
- Messages.app signed in
- Full Disk Access granted to the compiled binary

## Build & Install

```bash
cd imsg-bridge
swift build -c release
cp .build/release/imsg-bridge /Applications/imsg-bridge
```

Then grant Full Disk Access to `/Applications/imsg-bridge` in System Settings > Privacy & Security > Full Disk Access.

## Usage

```bash
/Applications/imsg-bridge
```

A 💬 icon appears in the menu bar. The HTTP server starts on `http://127.0.0.1:8423`.

## API

### `GET /health`

```bash
curl http://127.0.0.1:8423/health
# {"ok": true}
```

### `GET /chats?limit=N`

```bash
curl "http://127.0.0.1:8423/chats?limit=5"
```

### `GET /history?contact=...&limit=N`

```bash
curl "http://127.0.0.1:8423/history?contact=+14155551212&limit=20"
```

### `POST /send`

Send text, an image, or both:

```bash
# Text
curl -X POST http://127.0.0.1:8423/send \
  -H "Content-Type: application/json" \
  -d '{"to": "+14155551212", "message": "Hello"}'

# Image
curl -X POST http://127.0.0.1:8423/send \
  -H "Content-Type: application/json" \
  -d '{"to": "+14155551212", "file": "/path/to/photo.jpg"}'

# Text + Image
curl -X POST http://127.0.0.1:8423/send \
  -H "Content-Type: application/json" \
  -d '{"to": "+14155551212", "message": "Check this out", "file": "/path/to/photo.jpg"}'
```

## Security

- **Localhost only** — bound via `NWListener` with `.loopback` (kernel-enforced, not just address filtering)
- **No shell injection** — arguments passed as arrays to `Process`, never through a shell
- **No external dependencies** — uses only Apple frameworks (AppKit, Network, Foundation)

## License

MIT
