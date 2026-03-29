# Typinator Agent Guide

How to manage [Typinator](https://www.ergonis.com/typinator) text expansion snippets programmatically. Built for AI agents (Claude Code, Gemini CLI, etc.) but works for any automation.

## Quick Start

```bash
# Clone the repo
git clone https://github.com/chezluc/lukes-tools.git
cd lukes-tools/typinator-cli

# Add a snippet
node index.js add --set "My Set" btw "by the way"

# List snippets
node index.js list --set "My Set"

# Search
node index.js search btw
```

## CLI Reference

All commands output JSON for easy parsing.

| Command | Description |
|---|---|
| `sets` | List all rule sets |
| `list --set <name>` | List all rules in a set |
| `add --set <name> <abbr> <expansion>` | Create a snippet |
| `search <query> [--set <name>]` | Search by abbreviation or expansion text |
| `delete --set <name> <abbr>` | Delete a snippet |
| `duplicates [--set <name>]` | Find duplicate abbreviations |
| `remove-duplicates --set <name>` | Remove duplicates (keeps first) |

Set `TYPINATOR_SET` env var to avoid passing `--set` every time.

## Direct AppleScript (No Dependencies)

If you don't want to use the CLI tool, you can use `osascript` directly:

```bash
# Add a snippet
osascript -e 'tell application "Typinator" to make new rule at end of rule set "My Set" with properties {abbreviation:"btw", plain expansion:"by the way"}'

# List all rules in a set
osascript -e 'tell application "Typinator" to abbreviation of every rule of rule set "My Set"'

# Get a specific rule's expansion
osascript -e 'tell application "Typinator" to plain expansion of (first rule of rule set "My Set" whose abbreviation is "btw")'

# Delete a snippet
osascript -e 'tell application "Typinator" to delete (first rule of rule set "My Set" whose abbreviation is "btw")'

# Search via quick search (opens Typinator UI)
osascript -e 'tell application "Typinator" to quick search "btw"'

# List all set names
osascript -e 'tell application "Typinator" to name of every rule set'

# Create a new rule set
osascript -e 'tell application "Typinator" to make new rule set with properties {name:"My New Set"}'

# Disable a set
osascript -e 'tell application "Typinator" to set enabled of rule set "My Set" to false'
```

### Multiline Expansions

Use a heredoc to avoid escaping issues:

```bash
osascript <<'EOF'
tell application "Typinator"
    make new rule at end of rule set "My Set" with properties {abbreviation:"mysnippet", plain expansion:"line 1
line 2
line 3"}
end tell
EOF
```

### Reading Expansions to a File (For Multiline Safety)

```bash
# Write expansion to file, then read it into Typinator
cat > /tmp/expansion.txt << 'EXPEOF'
This is a multiline
expansion with "quotes" and 'apostrophes'
and special characters: $HOME ~/path
EXPEOF

osascript <<'EOF'
set expFile to POSIX file "/tmp/expansion.txt"
set newExp to read expFile as «class utf8»
tell application "Typinator"
    make new rule at end of rule set "My Set" with properties {abbreviation:"mysnippet", plain expansion:newExp}
end tell
EOF
```

## Organizing Snippets

A recommended set structure for teams or power users:

| Set | Purpose |
|---|---|
| `ai.main` | AI agent shortcuts (prompts, common paths, CLI commands) |
| `organized.general` | General-purpose shortcuts |
| `organized.git` | Git commands (pull, push, commit) |
| `organized.html` | HTML/CSS snippets |
| `organized.work` | Work-related (project management, tools) |
| `organized.files` | File copy/move operations |
| `organized.auth` | Credentials and login shortcuts |
| `organized.email` | Email-related shortcuts |
| `organized.launch` | App launch / open commands |
| `organized.scripting` | Script and terminal shortcuts |

## Cleanup Workflow

To audit and clean up an existing Typinator installation:

1. **Backup** all sets first:
   ```bash
   osascript <<'EOF' > typinator-backup.tsv
   tell application "Typinator"
       set output to ""
       repeat with s in (every rule set)
           set sName to name of s
           repeat with r in (every rule of s)
               set a to abbreviation of r
               set e to plain expansion of r
               set output to output & sName & tab & a & tab & e & linefeed
           end repeat
       end repeat
       return output
   end tell
   EOF
   ```

2. **Find duplicates** across sets:
   ```bash
   node index.js duplicates --set "My Set"
   ```

3. **Remove duplicates** (keeps first occurrence):
   ```bash
   node index.js remove-duplicates --set "My Set"
   ```

4. **Create organized sets** and move rules into them using the CLI or AppleScript.

5. **Disable old sets** after confirming the organized sets are complete:
   ```bash
   osascript -e 'tell application "Typinator" to set enabled of rule set "Old Set" to false'
   ```

## Gotchas

- **Typinator must be running** for any command to work
- **Changes are immediate** — no restart needed after adding/deleting rules
- **Multiline expansions** get split on newlines when read via `osascript` output — use the file-based approach above for reliable round-tripping
- **Duplicate set names** are allowed in Typinator — use `unique id` to distinguish them
- **Abbreviations with quotes** (`"en_US"`) can cause AppleScript escaping issues — use the file-based approach
- **Set names with apostrophes** in unique IDs can break AppleScript — use index-based access (`rule set 3`) instead

## License

MIT
