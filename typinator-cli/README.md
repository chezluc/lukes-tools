# typinator-cli

A command-line tool for managing [Typinator](https://www.ergonis.com/typinator) text expansion snippets via AppleScript. Designed for both humans and AI agents.

## Requirements

- macOS
- [Typinator](https://www.ergonis.com/typinator) installed and running
- Node.js 16+

## Installation

```bash
# From this repo
npm install -g ./typinator-cli

# Or run directly
node typinator-cli/index.js <command>
```

## Usage

All output is JSON for easy parsing by scripts and AI agents.

### List rule sets

```bash
typinator-cli sets
```

### List rules in a set

```bash
typinator-cli list --set "My Snippets"
```

### Add a snippet

```bash
typinator-cli add --set "My Snippets" btw "by the way"
```

### Search for snippets

```bash
# Search within a specific set
typinator-cli search png --set "My Snippets"

# Search across all sets (slower)
typinator-cli search png
```

### Delete a snippet

```bash
typinator-cli delete --set "My Snippets" btw
```

### Find duplicate abbreviations

```bash
# Within a specific set
typinator-cli duplicates --set "My Snippets"

# Across all sets (slower)
typinator-cli duplicates
```

### Remove duplicates

Removes duplicate abbreviations within a set, keeping the first occurrence.

```bash
typinator-cli remove-duplicates --set "My Snippets"
```

## Environment Variable

Set `TYPINATOR_SET` to avoid passing `--set` every time:

```bash
export TYPINATOR_SET="My Snippets"
typinator-cli add btw "by the way"
typinator-cli list
```

## AI Agent Integration

This tool outputs JSON, making it easy for AI agents (Claude Code, Gemini CLI, etc.) to manage Typinator snippets programmatically.

```bash
# Agent creates a snippet
typinator-cli add --set "ai.main" pngpng "check the last png created on the desktop"

# Agent checks for duplicates before adding
typinator-cli search pngpng --set "ai.main"

# Agent lists what's available
typinator-cli list --set "ai.main"
```

## How It Works

The CLI uses `osascript` to communicate with Typinator's AppleScript dictionary. Typinator must be running for commands to work. No files are modified directly — all operations go through Typinator's scripting interface, so changes are immediately live.

## License

MIT
