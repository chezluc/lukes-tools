# Safe rm — Trash Instead of Delete

A zsh function that intercepts `rm` and `rmdir` and routes them to `trash` instead of permanently deleting files. Inspired by [this TikTok tip](https://www.tiktok.com/t/ZP8pQPBEa/).

## The Problem

`rm -rf` is permanent. One wrong path and your files are gone with no recovery option.

## The Fix

Install `trash` (sends files to macOS Trash instead of deleting them), then wrap `rm` and `rmdir` as zsh functions that strip flags and call `trash` instead.

## Setup

**1. Install trash**

```bash
brew install trash
```

**2. Add to `~/.zshrc`**

```zsh
# Safety wrapper — strip flags and send to Trash instead of permanently deleting
rm() {
  local args=()
  for arg in "$@"; do
    [[ "$arg" == -* ]] && continue
    args+=("$arg")
  done
  trash "${args[@]}"
}

rmdir() {
  local args=()
  for arg in "$@"; do
    [[ "$arg" == -* ]] && continue
    args+=("$arg")
  done
  trash "${args[@]}"
}
```

**3. Reload your shell**

```bash
source ~/.zshrc
```

## How It Works

- All flags (`-rf`, `-Rf`, `-f`, `-r`, etc.) are silently stripped
- Only the file/folder paths are passed to `trash`
- Files land in macOS Trash — recoverable via Finder
- Works with `rm`, `rm -rf`, `rmdir` — any combination

## Bypassing (when you really need permanent delete)

```bash
command rm -rf /path/to/file   # bypasses the wrapper
/bin/rm -rf /path/to/file      # same
```

## Source

Tip from: https://www.tiktok.com/t/ZP8pQPBEa/
