# lukes-tools

AI orchestration patterns and developer tools.

## Demo

[![Using tmux as a Subagent Bridge for Claude Code](https://img.youtube.com/vi/0IJUylA0TPE/maxresdefault.jpg)](https://www.youtube.com/watch?v=0IJUylA0TPE)

## Contents

- **[tmux-subagent-pattern.md](tmux-subagent-pattern.md)** — Using tmux as a subagent bridge for Claude Code. Orchestrate any CLI-based AI tool (Gemini CLI, Ollama, aider, etc.) from Claude Code using tmux send-keys and capture-pane.

## Security Considerations

- **Autonomous mode risks** — Enabling YOLO or auto-approve mode in the target CLI bypasses confirmation prompts. A malicious or hallucinated prompt could trigger destructive actions (file writes, shell commands) without user approval. Only enable autonomous mode in trusted environments, and consider scoping the target CLI's permissions (e.g., sandboxing, read-only filesystem).
- **Prompt injection via send-keys** — If prompt text is dynamically constructed from untrusted input, special characters could escape the quoted string and execute arbitrary commands in the tmux session. Always sanitize or hard-code prompts when possible. Avoid piping raw external data directly into `tmux send-keys`.
- **Sensitive data in pane buffer** — `tmux capture-pane` output is passed back into Claude Code's context window. If the target CLI returns API keys, credentials, or other sensitive data, that information flows through the orchestration layer. Avoid sending prompts that could surface secrets, and clean up sessions when done with `tmux kill-session`.
