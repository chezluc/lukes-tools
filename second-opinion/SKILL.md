---
name: second-opinion
description: Get a second opinion from another model when Claude is stuck, looping, or outside its comfort zone. Routes to DeepSeek, Gemini CLI, Codex CLI, or a specific NVIDIA NIM endpoint via tmux or curl. Always attaches the breadcrumb trail if one exists.
---

# Second Opinion Skill

When Claude has tried 3+ approaches without progress, or is clearly outside its strong suit (highly specialized domain, long context that exhausts Claude, vision/audio task, code in an obscure framework), call `/second-opinion`. This skill:

1. Reads `.orchestrator/breadcrumbs.md` (if it exists) to avoid wasting the advisor's tokens on context Claude already knows.
2. Picks the right advisor from the table below (or honors the user's pick).
3. Sends the problem + trail to the advisor.
4. Reads the advisor's reply back into Claude's context.
5. Optionally appends the advisor's suggestion to the trail as a new entry.

## When to use

**Manual triggers:** user says `/second-opinion`, "get a second opinion", "ask another model", "what does X think".

**Auto-triggers:** When you've hit any of these *and* a breadcrumb trail shows 3+ `result: failure` entries for the same sub-goal, escalate without being asked — announce it in one line, then proceed:

- Same test failing 4+ times with different fixes
- Same compile error after 3 type-changes
- Looping on a DOM / CSS / layout problem (good vision-model use case)
- User says "I don't know either" after you asked for help

## Advisor routing table

Pick based on **problem type**, not vibes. If the user specifies an advisor, honor it.

| Problem type                          | Primary                                    | Fallback                                  |
|---------------------------------------|--------------------------------------------|-------------------------------------------|
| Deep reasoning / stuck logic          | **DeepSeek V3.1 Terminus** (NIM — Pattern A) | DeepSeek CLI (Pattern C, has tools)     |
| Code / refactor / framework question  | **Devstral 2 123B** (NIM — Pattern A)      | **Codex CLI** (Pattern B-codex, has tools)|
| Long context (file dumps, logs)       | **Kimi K2 Thinking** (NIM, 256K ctx)       | **Gemini CLI** (Pattern B, 1M ctx)        |
| Agentic / tool-calling decisions      | **Mistral Nemotron** (NIM)                 | DeepSeek V3.1 (NIM)                        |
| Google-searchable / "what's current"  | **Gemini CLI** (Pattern B, native Google Search) | DeepSeek CLI (Pattern C)            |
| Needs to actually run tools (read files, bash) | **Codex CLI** or **DeepSeek CLI** (tmux) | —                                  |
| Vision (screenshot, UI, layout)       | **Gemma 3 27B** (NIM)                      | **phi-4-multimodal** (NIM), Gemini CLI    |
| Audio / speech understanding          | **phi-4-multimodal-instruct** (NIM)        | Gemma 3n (NIM)                             |
| Safety/content classification         | **llama-guard-4-12b** (NIM)                | nemotron-3-content-safety (NIM)            |
| "Just a sanity check" (cheapest)      | **nemotron-mini-4b-instruct** (NIM, 0.6s)  | gemma-3n-e2b-it                            |

**Full verified advisor pool with keychain service names, latency, and quirks:**
`~/nvidia-tools/verified-advisors.md`

That file is the authoritative list — read it before dispatching if unsure which model to call. It also lists **dead endpoints** (paligemma 410, mistral-medium-3 & minimax-m2.7 timeouts) so you don't waste time.

## Three invocation patterns

### Pattern A — NVIDIA NIM via curl (fast, stateless, one-shot)

Best for quick second opinions where you don't need back-and-forth. No tmux needed.

```bash
# Example: DeepSeek V3.1 Terminus
MODEL_ID="deepseek-ai/deepseek-v3.1-terminus"
KEY_SERVICE="nvidia-nim-api-key-deepseek-ai-deepseek-v3.1-terminus"
KEY=$(security find-generic-password -s "$KEY_SERVICE" -a "you@example.com" -w)

ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
TRAIL="$ROOT/.orchestrator/breadcrumbs.md"
TRAIL_TAIL=$( [ -f "$TRAIL" ] && tail -n 200 "$TRAIL" || echo "(no breadcrumb trail)" )

# Construct the prompt (Claude fills in ASK)
ASK="<Claude's question — what's stuck, what's been tried, what help is needed>"

PAYLOAD=$(jq -cn --arg model "$MODEL_ID" --arg trail "$TRAIL_TAIL" --arg ask "$ASK" '{
  model: $model,
  messages: [
    {role:"system", content:"You are a second-opinion advisor. The primary agent (Claude Code) is stuck. Read the breadcrumb trail to see what has been tried, then propose ONE concrete next step that has NOT been tried. Be terse and specific. Include file:line when relevant."},
    {role:"user", content:("Breadcrumb trail (last attempts):\n\n" + $trail + "\n\n---\n\nCurrent question:\n" + $ask)}
  ],
  temperature: 0.2,
  max_tokens: 4096,
  stream: false
}')

RESPONSE=$(curl -s https://integrate.api.nvidia.com/v1/chat/completions \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

echo "$RESPONSE" | jq -r '.choices[0].message.content'
```

For biology/health/VLM models the base URL differs — use the `base_url` column from the CSV (e.g. `ai.api.nvidia.com/v1/vlm/...`).

### Pattern B — Gemini CLI via tmux (Google Search / long context)

Reuse the tmux pattern from the deep-research skill — `second-opinion` is just a one-shot version.

```bash
# Start or reuse session
tmux has-session -t second-opinion-gemini 2>/dev/null || tmux new-session -d -s second-opinion-gemini

# Launch Gemini CLI if not already running
tmux send-keys -t second-opinion-gemini "gemini" Enter

# Send prompt — include the trail
ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
PROMPT=$(cat <<EOF
I'm stuck on a problem and need a second opinion. Here's what's been tried (breadcrumb trail):

$(tail -n 200 "$ROOT/.orchestrator/breadcrumbs.md" 2>/dev/null || echo '(no trail)')

---

The current question is: <Claude fills in>

Use Google Search if relevant. Propose ONE concrete next step not yet tried. Terse and specific.
EOF
)
# send content, then Enter separately (known tmux send-keys gotcha)
tmux send-keys -t second-opinion-gemini "$PROMPT"
tmux send-keys -t second-opinion-gemini Enter

# Poll for completion — prompt bar returns when done
sleep 8
tmux capture-pane -t second-opinion-gemini -p -S -500 | tail -60
```

### Pattern B-codex — Codex CLI via tmux

Use when the question is code-specific and you want the advisor to actually read files from the repo rather than work from your paste.

```bash
tmux has-session -t second-opinion-codex 2>/dev/null || tmux new-session -d -s second-opinion-codex

# Launch Codex CLI if not running
tmux send-keys -t second-opinion-codex "codex" Enter

# Open in WezTerm (same pattern as DeepSeek CLI)
osascript -e 'tell application "WezTerm" to activate'
sleep 1
osascript -e '
tell application "System Events"
    tell process "wezterm-gui"
        keystroke "n" using command down
        delay 1
        keystroke "tmux attach -t second-opinion-codex"
        key code 36
    end tell
end tell'
sleep 10

ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
tmux send-keys -t second-opinion-codex "Read $ROOT/.orchestrator/breadcrumbs.md. The primary agent (Claude Code) has tried the attempts listed there and is stuck. Propose ONE concrete next step that has NOT been tried. You can read any file in this repo. Terse and specific, with file:line."
tmux send-keys -t second-opinion-codex Enter

sleep 15
tmux capture-pane -t second-opinion-codex -p -S -2000 | tail -80
```

### Pattern C — DeepSeek CLI (Claude Code pointed at DeepSeek) via tmux

Use when you want DeepSeek to actually run tools (WebSearch, file reads) rather than just answer once. Pattern is identical to what the `deep-research` skill uses — reuse the `deepseek-research` tmux session by renaming it `second-opinion-deepseek` so sessions don't collide.

```bash
tmux has-session -t second-opinion-deepseek 2>/dev/null || tmux new-session -d -s second-opinion-deepseek

tmux send-keys -t second-opinion-deepseek "cd . && export ANTHROPIC_BASE_URL='https://api.deepseek.com/anthropic' && export ANTHROPIC_AUTH_TOKEN=\$(cat ~/.anthropic_api_key) && export ANTHROPIC_MODEL='deepseek-chat' && export ANTHROPIC_DEFAULT_HAIKU_MODEL='deepseek-chat' && claude --dangerously-skip-permissions" Enter

# Wait for Claude Code to load
sleep 12

# Send the prompt — separate Enter
ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
tmux send-keys -t second-opinion-deepseek "I'm stuck. Read $ROOT/.orchestrator/breadcrumbs.md, then propose ONE concrete next step that hasn't been tried. You have Read/WebSearch tools if you need them. Current question: <fill in>"
tmux send-keys -t second-opinion-deepseek Enter

# Capture output after it's done
sleep 20
tmux capture-pane -t second-opinion-deepseek -p -S -2000 | tail -100
```

## Flow inside the skill

Whichever pattern you pick:

1. **Read the trail** — `tail -n 200 .orchestrator/breadcrumbs.md` (empty-safe).
2. **Compose the ask** — one paragraph: what's the outer goal, what specifically is stuck right now, what concrete answer you want.
3. **Send.**
4. **Capture output** — save to `.orchestrator/second-opinion-<YYYY-MM-DDTHHMM>-<advisor>.md`.
5. **Append to breadcrumb trail** as a new entry:
   ```markdown
   ## <timestamp> — Consulted <advisor>
   - **goal:** <same as outer>
   - **advisor:** <advisor name>
   - **suggestion:** <one-line summary of the advice>
   - **full reply:** .orchestrator/second-opinion-<...>.md
   - **next:** <what you'll try based on the advice>
   ```
6. **Act on it** — don't just relay the advice; pick the next step and execute.

## Picking an advisor automatically

If the user didn't name one, match on problem type:

```
code-related          → devstral-2-123b-instruct-2512
long file/log dump    → kimi-k2-thinking
reasoning/stuck logic → deepseek-ai/deepseek-v3.1-terminus
needs web search      → Gemini CLI (Pattern B)
needs to run tools    → DeepSeek CLI (Pattern C)
vision/screenshot     → gemma-3-27b-it
```

Ambiguous? Default to `deepseek-ai/deepseek-v3.1-terminus` via Pattern A. It's fast and the strongest all-purpose reasoner in the pool.

## Keychain conventions

All NVIDIA NIM keys are stored under service `nvidia-nim-api-key-<vendor>-<model>`, account `you@example.com` (replace with your own). Verify:

```bash
security find-generic-password -s "nvidia-nim-api-key-deepseek-ai-deepseek-v3.1-terminus" -a "you@example.com" -w
```

If the key is missing, check the CSV (`~/nvidia-tools/free-endpoints-details.csv`) — some entries were marked `active-playground` where the key wasn't auto-captured and needs manual generation via the UI.

## Cost note

The NIM free endpoints are genuinely free for reasonable volume, so Pattern A is almost always the cheapest option. Reserve Pattern C (DeepSeek CLI) for when you truly need tool use — it burns DeepSeek API credits on your key.

## Skill invocation

When the user types `/second-opinion [advisor-name]`, do the flow above. If no advisor is given, pick one per the table and announce it in one line (`Asking DeepSeek V3.1 Terminus about <X>…`).
