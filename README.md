# Lukes Tools 🛠️

A collection of AI orchestration patterns, automation scripts, and development tools for high-fidelity technical workflows.

## 🗂️ Included Tools & Patterns

### 🍎 [AppleScript Style Guide & Patterns](./applescript-patterns/README.md)
Consistent patterns and practices for writing robust AppleScripts that interact with macOS applications, keyboard/mouse, and CLI tools like `cliclick`.

### 📟 [tmux Subagent Pattern](./tmux-subagent/README.md)
An architectural pattern for using `tmux` as a communication bridge between AI agents (like Claude Code and Gemini CLI), enabling multi-agent orchestration without custom APIs.

### 🔎 [Job Search Sites](./job-search-sites/README.md)
A plain-text list of sites used as inputs for job-search workflows.

### 🔤 [Alfred Workflows](./alfred-workflows/README.md)
Custom Alfred 5 workflows for macOS automation, including an **Add Typinator Snippet** workflow that creates text expansion snippets directly from Alfred using Typinator's AppleScript dictionary.

### ⌨️ [Typinator CLI](./typinator-cli/README.md)
A Node.js CLI for managing [Typinator](https://www.ergonis.com/typinator) snippets from the terminal. Add, search, list, delete snippets and find/remove duplicates — all via JSON output. Built for AI agent integration.

---

## 🚀 Principles
- **Systems-Led**: Built for reliable, repeatable automation.
- **Agent-Friendly**: Designed to be easily understood and executed by LLMs/Agents.
- **Minimalist**: Prefers standard Unix tools and native primitives.

## 📜 License
MIT
