# Lukes Tools 🛠️

A collection of AI orchestration patterns, automation scripts, and development tools for high-fidelity technical workflows.

## 🗂️ Included Tools & Patterns

### 🍎 [AppleScript Style Guide & Patterns](./applescript-patterns/README.md)
Consistent patterns and practices for writing robust AppleScripts that interact with macOS applications, keyboard/mouse, and CLI tools like `cliclick`.

### 📟 [tmux Subagent Pattern](./tmux-subagent/README.md)
An architectural pattern for using `tmux` as a communication bridge between AI agents (like Claude Code and Gemini CLI), enabling multi-agent orchestration without custom APIs.

### 💬 [imsg-bridge](./imsg-bridge/README.md)
A macOS menu bar app that exposes a localhost HTTP API for iMessage. Other programs can send/read messages without needing Full Disk Access — only imsg-bridge needs it.

### 🔎 [Job Search Sites](./job-search-sites/README.md)
A plain-text list of sites used as inputs for job-search workflows.

### 🔤 [Alfred Workflows](./alfred-workflows/README.md)
Custom Alfred 5 workflows for macOS automation, including an **Add Typinator Snippet** workflow that creates text expansion snippets directly from Alfred using Typinator's AppleScript dictionary.

### 🔬 [Deep Research](./deep-research/README.md)
A Claude Code skill that orchestrates multi-engine deep research sessions. Launches DeepSeek and Gemini CLI as primary research engines via tmux, or runs 5 parallel Claude subagents internally. Synthesizes findings into structured reports with CSV/Google Sheets output.

### ⌨️ [Typinator CLI](./typinator-cli/README.md)
A Node.js CLI for managing [Typinator](https://www.ergonis.com/typinator) snippets from the terminal. Add, search, list, delete snippets and find/remove duplicates — all via JSON output. Built for AI agent integration.

---

## 🚀 Principles
- **Systems-Led**: Built for reliable, repeatable automation.
- **Agent-Friendly**: Designed to be easily understood and executed by LLMs/Agents.
- **Minimalist**: Prefers standard Unix tools and native primitives.

## 📜 License
MIT
