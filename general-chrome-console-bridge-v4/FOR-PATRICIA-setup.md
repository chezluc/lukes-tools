# For Patricia — New AI Employee Setup + Chrome Console Bridge

(Paste the section below into your Claude Code session. This sets you up as a new AI employee on your machine, then downloads and analyzes the Chrome console-bridge tool. Windows-specific notes are baked in.)

---

You are going to set yourself up as a new AI employee on this machine and then download and analyze a Chrome console-bridge tool. Work autonomously; don't ask clarifying questions you can reasonably infer.

## 1. Create your employee record (LOCAL — no GitLab)

Create a folder `./ai-employee/` in the current directory and save a file `./ai-employee/profile.md` describing yourself as a new employee, with this front matter and body:

```
name: <pick a short codename for yourself>
role: Chrome console-bridge operator (browser automation)
machine: Windows
created: <today's date>
tools: Claude account, tmux
notes: standalone setup — no GitLab employee DB, no Lapis, no team. Self-contained.
```

In the body, write 3–5 lines on what you'll do: download the chrome-console-bridge-v4 tool, analyze how it works, and report whether it can run on this Windows machine.

(You don't have a GitLab employee database, so everything stays in this local folder — that's intentional.)

## 2. Open a dedicated tmux session

Start a new tmux session named after your codename, e.g.:

```
tmux new -s bridge-work
```

Do your work inside it.

## 3. Download and analyze the bridge tool

Clone or download:
`https://github.com/chezluc/lukes-tools/tree/main/general-chrome-console-bridge-v4`

(Full repo: `git clone https://github.com/chezluc/lukes-tools.git`, then `cd lukes-tools/general-chrome-console-bridge-v4`)

Read the source: `package.json`, `bridge/server.mjs`, `scripts/build.mjs`, `manifest.json`, `start_bridge.sh`, `README.md`, `STARTUP.md`, and the `src/` tree. Write your analysis to `./ai-employee/bridge-analysis.md`.

## 4. IMPORTANT — Windows notes (this tool was built on macOS)

A review already found: the **server, build, and Chrome extension are fully portable and run on Windows as-is** — but the `start_bridge.sh` launcher is **macOS-only** (bash + AppleScript/osascript + `/tmp` + inline env-var syntax) and will NOT run on native Windows. So:

- **Don't rely on `start_bridge.sh`.** Start the server directly.
- Lowest-effort path on Windows (cmd):
  ```
  npm install
  set BRIDGE_PORT=4471 && set BRIDGE_INSTANCE=canary && node ./bridge/server.mjs
  ```
  (PowerShell: `$env:BRIDGE_PORT=4471; $env:BRIDGE_INSTANCE='canary'; node ./bridge/server.mjs`)
- Then load the built `dist-canary` folder as an **unpacked extension** in Chrome/Canary, open `bridge.html` **manually** (the osascript auto-tab step is mac-only).
- Smoke-test the port with `Invoke-RestMethod http://127.0.0.1:4471/...` instead of `curl`.
- Ports `127.0.0.1:4471` (Canary) / `:4472` (Chrome) bind fine on Windows.
- If you want a proper launcher, write a `start_bridge.ps1` mirroring the bash one: replace `osascript` with manual-tab guidance, `/tmp` with `$env:TEMP`, and use `cross-env` (or `set`/`$env:`) for the port var.

## 5. Report back

In `./ai-employee/bridge-analysis.md`, conclude with: does it run on this Windows machine? (yes, with the launcher caveat above), what you changed/started, and anything that blocked you.
