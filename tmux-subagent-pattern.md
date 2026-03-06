# Pattern: Using tmux as a Subagent Bridge for Claude Code

## Overview

tmux can serve as an inter-agent communication layer, allowing Claude Code to orchestrate other CLI-based AI tools (e.g., Gemini CLI, Ollama, aider) as subagents. Claude Code sends prompts, monitors progress, and retrieves results — all through tmux's built-in pane capture and key-sending capabilities.

This pattern requires no API keys, no custom integrations, and works with any AI tool that runs in a terminal.

**Recommended usage:** Run the entire workflow as a subagent within Claude Code. This keeps your main conversation free while the subagent handles session setup, prompt delivery, monitoring, and result retrieval autonomously in the background.

## Architecture

```
┌─────────────┐    tmux send-keys     ┌──────────────┐
│ Claude Code  │ ──────────────────>   │  tmux session │
│  (primary)   │                       │  ┌──────────┐ │
│              │ <──────────────────   │  │ AI CLI   │ │
│              │   tmux capture-pane   │  │ (target) │ │
└─────────────┘                        │  └──────────┘ │
                                       └──────────────┘
```

- **Claude Code** acts as the orchestrator
- **tmux** acts as the communication bus
- **Target AI CLI** runs inside the tmux session and does the work
- **The user** can optionally watch progress in a separate Terminal window

## Setup

### 1. Create a tmux session and start the target CLI

```bash
# Kill any existing session and create a fresh one
tmux kill-session -t research 2>/dev/null; tmux new-session -d -s research

# Start the target AI CLI inside the session
tmux send-keys -t research "your-ai-cli-command" Enter
```

### 2. (Optional) Open a visible Terminal window

Open Terminal so the user can watch the AI work in real-time. This uses AppleScript on macOS to activate Terminal, attach to the session, shrink text for readability, and position the window:

```bash
osascript -e '
set delayOne to 0.3
tell application "Terminal"
    activate
    do script "tmux attach -t research"
end tell
delay 2
tell application "System Events"
    keystroke "-" using command down
    delay delayOne
    keystroke "-" using command down
    delay delayOne
    keystroke "-" using command down
end tell'
```

> **Optional:** If you use a window manager like [SizeUp](https://www.irradiatedsoftware.com/sizeup/), you can snap the Terminal window to one side of the screen:
> ```bash
> osascript -e 'tell application "SizeUp" to do action Right'
> ```
> Substitute your preferred window manager (Rectangle, Magnet, etc.) or skip this step entirely.

### 3. Wait for the CLI to load

The target CLI must be fully loaded before sending prompts. Wait, then verify by checking the tmux pane for the expected input prompt:

```bash
sleep 10

# Check for the CLI's input prompt
tmux capture-pane -t research -p | tail -5
```

Only proceed once you see the CLI's input prompt in the output.

### 4. (Optional) Enable autonomous mode

Some CLIs have an autonomous/YOLO mode that skips confirmation prompts. If needed, activate it via AppleScript keystroke:

```bash
osascript -e '
set delayOne to 0.3
tell application "Terminal" to activate
delay delayOne
tell application "System Events"
    keystroke "y" using control down
end tell'

# Verify the mode is active
sleep 2
tmux capture-pane -t research -p | tail -5
```

### 5. Send the prompt

```bash
tmux send-keys -t research "Your research prompt here" Enter
```

> **Fallback:** If `Enter` doesn't register (some CLIs require window focus), use AppleScript:
> ```bash
> # First check if the prompt already submitted (look for spinner/response)
> tmux capture-pane -t research -p | tail -5
>
> # Only if still showing unsubmitted text:
> osascript -e '
> tell application "Terminal" to activate
> delay 0.3
> tell application "System Events"
>     key code 36
> end tell'
> ```

### 6. Monitor output

Read the tmux pane buffer from the command line — no need to switch windows:

```bash
# Read last N lines of the pane
tmux capture-pane -t research -p -S -100 | tail -60

# Quick status check
tmux capture-pane -t research -p | tail -5
```

### 7. Check for completion

Look for the CLI's input prompt to return without a spinner or progress indicator:

```bash
# Grab the full response
tmux capture-pane -t research -p -S -500
```

## Running Monitoring as a Background Subagent

The most powerful part of this pattern: delegate monitoring to a Claude Code subagent running in the background. This frees you to continue other work while the AI CLI processes.

Use Claude Code's Agent tool with `run_in_background: true` and a prompt like:

> Monitor the tmux session "research" for the CLI to finish its response.
> Check with `tmux capture-pane -t research -p -S -500 | tail -80`.
> If still working (spinner visible), wait 15 seconds and check again.
> Once done (input prompt returns without spinner), capture and return the full response.

Claude Code will notify you automatically when the subagent completes with the results.

## Key tmux Commands Reference

| Command | Purpose |
|---------|---------|
| `tmux new-session -d -s NAME` | Create a detached session |
| `tmux send-keys -t NAME "text" Enter` | Type text and press Enter |
| `tmux capture-pane -t NAME -p` | Read current visible pane content |
| `tmux capture-pane -t NAME -p -S -N` | Read last N lines of scrollback |
| `tmux send-keys -t NAME C-c` | Send Ctrl+C (cancel) |
| `tmux kill-session -t NAME` | Destroy the session |
| `tmux ls` | List active sessions |

## Compatible CLI Tools

This pattern works with any CLI-based AI tool, including:

- **Gemini CLI** — Google's terminal AI with built-in Google Search
- **Ollama** — Local LLM inference
- **aider** — AI pair programming tool
- **Open Interpreter** — Code execution agent
- **Any REPL or chat interface** running in a terminal

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Prompt not submitting | Activate Terminal via AppleScript, then press Enter with `key code 36` |
| Session not found | Check `tmux ls` for active sessions |
| Output truncated | Increase scrollback with `-S -1000` or larger |
| CLI hung/stuck | Send Ctrl+C via `tmux send-keys -t NAME C-c` |
| Autonomous mode not activating | CLI must be fully loaded first — add a longer delay before the keystroke |
| Before retrying Enter | Always check if the prompt already submitted (look for spinner/response text) to avoid duplicate submissions |

## Security Considerations

- **Autonomous mode risks** — Enabling YOLO or auto-approve mode in the target CLI bypasses confirmation prompts. A malicious or hallucinated prompt could trigger destructive actions (file writes, shell commands) without user approval. Only enable autonomous mode in trusted environments, and consider scoping the target CLI's permissions (e.g., sandboxing, read-only filesystem).
- **Prompt injection via send-keys** — If prompt text is dynamically constructed from untrusted input, special characters could escape the quoted string and execute arbitrary commands in the tmux session. Always sanitize or hard-code prompts when possible. Avoid piping raw external data directly into `tmux send-keys`.
- **Sensitive data in pane buffer** — `tmux capture-pane` output is passed back into Claude Code's context window. If the target CLI returns API keys, credentials, or other sensitive data, that information flows through the orchestration layer. Avoid sending prompts that could surface secrets, and clean up sessions when done with `tmux kill-session`.

## Why This Works

- **tmux send-keys** simulates keyboard input into any tmux pane
- **tmux capture-pane** reads pane content without switching windows
- **AppleScript** handles edge cases where CLI tools need window focus
- **Background subagents** enable non-blocking parallel AI research
- **No APIs or tokens needed** — pure terminal-level orchestration
