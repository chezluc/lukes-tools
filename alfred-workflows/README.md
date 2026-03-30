# Alfred Workflows

Custom Alfred workflows for macOS productivity automation.

## Add Typinator Snippet

Quickly create [Typinator](https://www.ergonis.com/typinator) text expansion snippets from Alfred.

### Usage

```
type <abbreviation> <expansion text>
```

**Example:** `type btw by the way` creates a snippet where typing `btw` expands to `by the way`.

### How it works

1. Type `type` in Alfred followed by the abbreviation and expansion text
2. Alfred shows a preview: `btw → by the way`
3. Press Enter to create the snippet in the `2026.main` rule set
4. Typinator opens Quick Search to confirm the new snippet

**Step 1:** Type the abbreviation

![Step 1](./screenshot-step1.png)

**Step 2:** Add the expansion — preview shows before creating

![Step 2](./screenshot-step2.png)

### Requirements

- [Alfred 5](https://www.alfredapp.com/) (Powerpack required for workflows)
- [Typinator](https://www.ergonis.com/typinator) running in the background

### Installation

1. Download [AddTypinatorSnippet.alfredworkflow](./AddTypinatorSnippet.alfredworkflow)
2. Double-click to import into Alfred
3. Ensure Typinator is running

### Configuration

The workflow creates snippets in the `2026.main` rule set by default. To change the target set, edit the Run Script action in Alfred and replace `"2026.main"` with your preferred rule set name.

### Technical Details

The workflow uses Typinator's AppleScript dictionary to programmatically create rules:

```applescript
tell application "Typinator"
    make new rule at end of rule set "2026.main" with properties {abbreviation:"btw", plain expansion:"by the way"}
    quick search "btw"
end tell
```

This is a Script Filter → Run Script workflow. The first word after `type` becomes the abbreviation; everything else becomes the expansion.
