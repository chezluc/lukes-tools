# AppleScript Style Guide & Patterns

This document outlines the consistent patterns and practices used across all AppleScripts in this repository.

## Core Principles

1. **Single System Events Clause**: All keyboard and mouse interactions are wrapped in a single `tell application "System Events"` block to avoid conflicts
2. **Consistent Delay Variables**: Every script starts with standardized delay settings
3. **Keyboard Shortcuts Over Menu Navigation**: Always use keyboard shortcuts when possible
4. **CLI Click for Mouse Operations**: Use `/usr/local/bin/cliclick` for precise mouse control

## Prerequisites & Dependencies

To use these patterns effectively, the following tools should be installed:

- **[cliclick](https://github.com/bluemania/cliclick)**: Command-line interface for clicking and typing. Essential for scripts that require mouse interactions.
- **[SizeUp](https://www.irradiatedsoftware.com/sizeup/)**: Window management tool used for positioning windows via AppleScript.
- **[Alfred](https://www.alfredapp.com/)**: (Optional) For scripts that integrate with Alfred's command bar.
- **Accessibility Permissions**: macOS requires "System Events" and any script runner (like Script Editor or Terminal) to have Accessibility permissions enabled in *System Settings > Privacy & Security > Accessibility*.

## Standard Script Structure

### 1. Delay Variables (Required)

Every script MUST start with delay variable declarations:

```applescript
set delayOne to 0.2  -- Standard short delay (can be 0.2, 0.4, or 0.5)
set pageDelay to 2   -- Longer delay for page loads or major operations
```

### 2. Application Activation

Always activate the target application before interacting:

```applescript
-- bring "ApplicationName" to the front
tell application "ApplicationName" to activate
delay delayOne
```

### 3. System Events Wrapper

**CRITICAL**: The System Events tell block can only appear ONCE per script. Wrap ALL keyboard interactions in a single System Events tell block:

```applescript
tell application "System Events"
    -- All keyboard shortcuts and keystrokes go here
    -- Never open another System Events block in the same script
end tell
```

## Common Patterns

### Text Typing Options

#### Option 1: Clipboard Paste (Faster, Recommended for Long Text)

For long commands or text, use clipboard to paste instantly:

```applescript
-- Set text to clipboard
set the clipboard to "long command or text here"
delay delayOne

-- Paste it
keystroke "v" using command down
delay delayOne
```

#### Option 2: Character Loop (More Realistic, Better for Short Text)

When typing needs to appear more natural, use character-by-character loops:

```applescript
set texttowrite to "your text here"
repeat with i from 1 to count characters of texttowrite
    keystroke (character i of texttowrite)
    delay 0.07
end repeat
delay delayOne
```

**When to use each:**
- **Clipboard**: Long commands, file paths, code blocks, URLs
- **Character Loop**: Short UI interactions, search terms, usernames

### Keyboard Shortcuts

Common keyboard shortcuts using consistent syntax:

```applescript
-- Command shortcuts
keystroke "c" using command down         -- ⌘c (copy)
keystroke "v" using command down         -- ⌘v (paste)
keystroke "a" using command down         -- ⌘a (select all)
keystroke "w" using command down         -- ⌘w (close window)

-- Multiple modifiers
keystroke "c" using {command down, option down}  -- ⌘⌥c
keystroke "g" using {command down, shift down}   -- ⌘⇧g

-- Special keys
key code 36    -- Enter/Return
key code 51    -- Delete/Backspace
key code 53    -- Escape
key code 125   -- Down arrow
key code 49    -- Space (with modifiers)
keystroke tab
keystroke return
```

### Mouse Clicks with CLI Click

Always use cliclick for mouse operations:

```applescript
-- Simple click
set clickX to 1076
set clickY to 902
do shell script "/usr/local/bin/cliclick c:" & clickX & "," & clickY
delay delayOne

-- Click with coordinates as string
set clickoneX to "1076,902"
do shell script "/usr/local/bin/cliclick c:" & clickoneX

-- Store and restore mouse position
do shell script "eval $(/usr/libexec/path_helper -s); cliclick p:. | tr -d \"\\n\" | pbcopy"
set thePosition to the clipboard
-- ... do operations ...
do shell script "eval $(/usr/libexec/path_helper -s); cliclick m:" & thePosition
```

### Window Management with SizeUp

Use SizeUp for window positioning:

```applescript
tell application "SizeUp" to do action Left
tell application "SizeUp" to do action Right
tell application "SizeUp" to do action Upper Right
```

### User Input Dialogs

Get user input with consistent dialog patterns:

```applescript
set numberOfTimes to the text returned of (display dialog "How many times?" default answer "")
delay delayOne
```

### Loops for Repetitive Tasks (Loop Setup)

Standard loop setup pattern for repeating operations:

```applescript
-- loop question
set numberOfTimes to the text returned of (display dialog "How many times?" default answer "")
delay delayOne

-- beginning of the loop
repeat numberOfTimes times
    -- Your operations here
end repeat
-- end numberOfTimes repeat
```

**Important**: When using loops, place the application activation and all operations INSIDE the loop so they repeat properly each time.

### Clipboard Operations

Working with clipboard data:

```applescript
-- Save to clipboard
set the clipboard to "text to save"

-- Get from clipboard
set myVar to the clipboard

-- Modify clipboard content
set the clipboard to "-" & (the clipboard)
```

## Advanced Patterns

### Shell Script Integration

For complex operations, integrate shell commands:

```applescript
-- Extract currency from clipboard
set currencyCommand to "echo " & quoted form of clipboardContent & " | grep -o '\\[.*\\]' | tr -d '[]'"
set fromCurrency to do shell script currencyCommand

-- Read file content to clipboard
do shell script "cat /path/to/file | pbcopy"
```

### Alfred Integration

Open Alfred and run commands:

```applescript
key code 49 using command down  -- Open Alfred
delay 0.2
keystroke "command text here"
delay 0.5
key code 36  -- Execute
```

## File Organization

### Naming Convention

Scripts follow a consistent naming pattern:
- `app.action.description.scpt` (compiled)
- `app.action.description.applescript` (text format)

Where:
- `app` = Application name or abbreviation (e.g., `pr` for Adobe Premiere, `gpt` for ChatGPT, `mail` for Mail)
- `action` = What the script does (e.g., `click`, `type`, `insert`, `copy`)
- `description` = Additional context (e.g., `microphone`, `clipboard`, `row above`)

Examples:
- `pr.click x coordinate.scpt`
- `gpt.click microphone.scpt`
- `mail.block sender.applescript`
- `chrome.insert row above.scpt`

## Best Practices

1. **Minimal Comments**: Only add comments for non-obvious operations
2. **Consistent Delays**: Always use the predefined delay variables
3. **Error Prevention**: Add appropriate delays between operations
4. **Readability**: Use clear variable names like `clickFieldX`, `clickSaveButton`
5. **Single Responsibility**: Each script should do one specific task well

## Example Complete Script

```applescript
set delayOne to 0.2
set pageDelay to 2

-- bring "Google Chrome" to the front
tell application "Google Chrome" to activate
delay delayOne

tell application "System Events"
    -- Navigate to search field
    keystroke "f" using command down
    delay delayOne
    
    -- Type search term
    set searchText to "example search"
    repeat with i from 1 to count characters of searchText
        keystroke (character i of searchText)
        delay 0.07
    end repeat
    delay delayOne
    
    -- Submit search
    key code 36
    delay pageDelay
end tell

-- Click on result
set resultX to 500
set resultY to 300
do shell script "/usr/local/bin/cliclick c:" & resultX & "," & resultY
```

## Troubleshooting

- If keyboard shortcuts don't work, ensure the application is activated first
- Add longer delays if operations are happening too fast
- Use `pageDelay` instead of `delayOne` for operations that load new content
- Test coordinates with cliclick before hardcoding them in scripts