---
name: breadcrumb-trail
description: Persist a living log of every approach tried when debugging or implementing something tricky, so future-you (or the second-opinion advisor) can see what's already been attempted and what the outcome was. Start when stuck or looping. Auto-trigger heuristics included.
---

# Breadcrumb Trail Skill

When Claude (you) are in a loop, keep getting told "that didn't work", or repeatedly editing the same 2-3 files, start a breadcrumb trail. It's a project-local append-only markdown log of: what you tried, why, the outcome. It does two jobs:

1. **Stops you repeating a failed approach** — before each new attempt, grep the trail.
2. **Feeds into `/second-opinion`** — when you escalate to another model, the trail is the single most valuable piece of context you can hand over.

## When to start one

**Manual triggers** (act immediately):
- User says any of: "I think we're looping", "we're in circles", "you tried that already", "start a breadcrumb trail", "document what you're trying"
- User corrects the same class of issue twice in one session

**Auto-detect triggers** (start one without asking):
- You've edited the same file 4+ times in the same session
- You've run the same command (or near-duplicates) 3+ times with the same failure
- A test/build has failed 3+ consecutive times for related reasons
- You catch yourself saying "let me try X" where X resembles something earlier in context

When any trigger fires, create the trail (silently — no ceremony), log what you just did, then continue.

## Where it lives

Per-project, at `<project-root>/.orchestrator/breadcrumbs.md`. Use the current working directory's git root when detectable, else `pwd`.

```bash
ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
mkdir -p "$ROOT/.orchestrator"
TRAIL="$ROOT/.orchestrator/breadcrumbs.md"
```

Also add `.orchestrator/` to `.gitignore` if not already there (check before writing):

```bash
[ -f "$ROOT/.gitignore" ] && ! grep -qx '.orchestrator/' "$ROOT/.gitignore" && echo '.orchestrator/' >> "$ROOT/.gitignore"
```

## Format (strict — downstream tools parse this)

Each entry is a level-2 heading plus YAML-ish body. Append only; never rewrite history.

```markdown
## <ISO-8601 timestamp> — <one-line summary>
- **goal:** <what outer task this attempt serves>
- **hypothesis:** <what you thought would fix it>
- **action:** <what you actually did — file:line or command>
- **result:** success | partial | failure | unknown
- **evidence:** <error text, diff hunk, test output — quoted>
- **learned:** <what this rules out or reveals>
- **next:** <what you'll try next, or "escalate:<reason>">
```

### First-entry header

When creating the file for the first time, write this preamble once:

```markdown
# Breadcrumb Trail
_Append-only log of attempts for this project. Newest at bottom. Read before trying anything — don't repeat a failed approach._

```

## Writing conventions

- **One entry per attempt**, not per thought. An "attempt" = a concrete action (edit, command, test run) that produced an outcome.
- **Never delete entries.** If an earlier attempt turns out to be wrong, add a new entry referencing the prior timestamp.
- **Quote evidence verbatim.** Don't paraphrase error messages.
- **Keep entries ≤ ~15 lines.** If an attempt is large, link to a file you wrote (e.g. `evidence: see .orchestrator/attempt-2026-04-24T10-15.log`).
- **Summary is imperative and specific.** `Tried useMemo on ChartProps` beats `Tried to fix chart`.

## Reading before each new attempt

Before any non-trivial next step, tail the last ~30 entries and check whether you're about to repeat something. One bash call:

```bash
tail -n 400 "$ROOT/.orchestrator/breadcrumbs.md"
```

Grep for keywords if the file is large:

```bash
grep -n -A 6 "<keyword or file path>" "$ROOT/.orchestrator/breadcrumbs.md"
```

If you find a prior entry with `result: failure` matching what you were about to try, DO something different — or escalate via `/second-opinion` and pass the trail.

## Escalation handoff

When escalating, pass the last N entries plus a one-paragraph summary. The `second-opinion` skill reads `.orchestrator/breadcrumbs.md` automatically, so you don't need to paste — just say which entries are most relevant:

```
/second-opinion — stuck. See breadcrumbs, entries from 2026-04-24T14:00 onwards. Core problem: <one sentence>.
```

## Closing a trail

When the outer task succeeds, add a final entry:

```markdown
## <timestamp> — RESOLVED
- **goal:** <original goal>
- **resolution:** <the thing that actually worked>
- **root cause:** <what was actually wrong>
- **attempts total:** <count>
```

Do not delete the trail — future sessions may hit the same class of bug and benefit from the history.

## Example

```markdown
## 2026-04-24T14:03:22Z — Try forcing React.memo on Chart
- **goal:** Fix chart flicker on parent re-render
- **hypothesis:** Chart is re-rendering because props aren't referentially stable
- **action:** Wrapped `<Chart>` in `React.memo` at src/Dashboard.tsx:142
- **result:** failure
- **evidence:** flicker persists; profiler shows Chart still re-rendering
- **learned:** memo fires (render count dropped) but DOM still flickers → not a re-render issue, something else is mutating the DOM
- **next:** check if the charting lib is doing its own animations on every data update

## 2026-04-24T14:18:05Z — Disable chart.js animations
- **goal:** Fix chart flicker on parent re-render
- **hypothesis:** chart.js is re-animating on every data push, not React
- **action:** `options: { animation: false }` at src/Chart.tsx:34
- **result:** success
- **evidence:** flicker gone, 30 min of manual testing clean
- **learned:** the flicker was never a React re-render issue — it was chart.js's default 1000ms animation on each update
- **next:** done
```

Two entries, clear chain of reasoning, future-you immediately sees: "memo didn't help; disabling chart.js animation did."

## Skill invocation

When the user types `/breadcrumb-trail`, confirm a trail is started at `<root>/.orchestrator/breadcrumbs.md`, write the first-entry header if missing, and log the current attempt. Then continue the work.

When you auto-trigger, do the same but don't announce — just start writing.
