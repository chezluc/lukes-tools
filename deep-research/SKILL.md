---
name: deep-research
description: Run a full multi-methodology deep research session on any topic. Launches DeepSeek (via Claude Code in tmux) and Gemini CLI (via tmux) as the primary research engines — they do the heavy lifting and use their own tokens. Claude orchestrates, monitors, synthesizes, and uploads results. Use whenever the user asks to research any topic deeply, thoroughly, or comprehensively.
---

The user wants deep, comprehensive research on a topic. You will orchestrate research using **DeepSeek and Gemini as the primary research engines** (they have all the same tools — WebSearch, WebFetch, file write — but use their own tokens, not Claude's). Claude's role is: launch, monitor, synthesize, format CSV, and upload to Google Sheets.

## Step 1 — Clarify & Choose Mode

If the topic is vague, ask ONE clarifying question. Then ask the user which research mode:

1. **Full (DeepSeek + Gemini)** — Two external engines via tmux. Most thorough, uses external tokens.
2. **DeepSeek only** — Single engine via tmux.
3. **Internal (Claude subagents)** — Runs entirely within this Claude Code session using parallel Agent subagents. No tmux, no external models. Uses Claude tokens but requires zero setup.

If the user says "internal", "local", "subagents", or "just claude", go to **Step 2C**. Otherwise proceed to Step 2.

## Step 2 — Launch DeepSeek + Gemini Simultaneously

Launch both in a **SINGLE message** using the Bash tool.

### Agent 1 — DeepSeek Claude Code (tmux) — PRIMARY RESEARCH ENGINE

DeepSeek running Claude Code has full access to WebSearch, WebFetch, Agent tool (sub-agents), and file writing. It does the bulk of the research.

```bash
# Create tmux session (reuse if exists)
tmux has-session -t deepseek-research 2>/dev/null || tmux new-session -d -s deepseek-research

# Launch Claude Code pointed at DeepSeek
tmux send-keys -t deepseek-research "cd . && export ANTHROPIC_BASE_URL='https://api.deepseek.com/anthropic' && export ANTHROPIC_API_KEY=\$(cat ~/.anthropic_api_key) && export ANTHROPIC_SMALL_FAST_MODEL='deepseek-chat' && export ANTHROPIC_MODEL='deepseek-chat' && claude --dangerously-skip-permissions" Enter

# Open Terminal window so user can watch
osascript -e '
tell application "Terminal"
    activate
    do script "tmux attach -t deepseek-research"
end tell'

# Wait for Claude Code to load
sleep 15
tmux capture-pane -t deepseek-research -p | tail -5
```

**IMPORTANT:**
- Use `deepseek-chat` NOT `deepseek-reasoner` (too expensive)
- The API key is at `~/.anthropic_api_key` — use `$(cat ~/.anthropic_api_key)`
- Do NOT use macOS keychain entries — they are different/outdated keys
- Do NOT kill and recreate tmux sessions unnecessarily — reuse them as shells

Once loaded, send the FULL research prompt. DeepSeek will use WebSearch, WebFetch, and its own sub-agents to do all the research:

```bash
tmux send-keys -t deepseek-research "You are a deep research agent with access to WebSearch, WebFetch, and the Agent tool. Research this topic THOROUGHLY:

{TOPIC}

METHODOLOGY — Use ALL of these approaches:
1. GPT-Researcher: Break topic into 5 sub-questions, WebSearch + WebFetch each, cite every claim
2. Knowledge-Gap Filling: Search broadly, identify gaps, fill them iteratively (3 rounds)
3. ReAct Loop: For each finding, reason about what to search next (minimum 10 cycles)
4. Hierarchical: Spawn 3-5 specialist sub-agents via the Agent tool to research different angles in parallel
5. Source Triangulation: Cross-reference findings, rate sources A-E, flag contradictions

OUTPUT REQUIREMENTS:
- Comprehensive markdown report with inline citations for every claim
- Source URLs for everything
- Save report to: RESEARCH/{topic-slug}/deepseek_report.md
- Also save a CSV version if the topic lends itself to tabular data

Be EXHAUSTIVE. Use as many WebSearch and WebFetch calls as needed. Spawn sub-agents for parallel research. This is a deep research task — thoroughness is more important than speed." Enter
```

### Agent 2 — Gemini CLI (tmux) — SECONDARY RESEARCH ENGINE (Google Search)

Gemini has native Google Search and provides a different perspective.

```bash
# Create tmux session (reuse if exists)
tmux has-session -t gemini-research 2>/dev/null || tmux new-session -d -s gemini-research

# Launch Gemini CLI
tmux send-keys -t gemini-research "gemini" Enter

# Open Terminal window
osascript -e '
tell application "Terminal"
    activate
    do script "tmux attach -t gemini-research"
end tell'

# Wait for Gemini to fully load
sleep 12
tmux capture-pane -t gemini-research -p | tail -5
```

Once loaded, send the research prompt:
```bash
tmux send-keys -t gemini-research "Deep research task: {TOPIC}

Use your Google Search capability extensively. Research this topic from multiple angles:
1. Current state and recent developments (last 2 years)
2. Key technical or domain-specific findings
3. Expert opinions and authoritative sources
4. Future trends and open questions

For each angle: run multiple searches, cross-reference findings, cite every source with URL.
Write a comprehensive markdown research report. Be thorough — use as many searches as needed.
Save your report to: RESEARCH/{topic-slug}/gemini_report.md" Enter
```

---

## Step 2C — Internal Mode (Claude Subagents)

Launch **5 parallel Agent subagents** in a single message, each researching a different angle of the topic. All agents use `subagent_type: "general-purpose"` with WebSearch + WebFetch.

### Agent allocation:
1. **Breadth agent** — Break topic into 5 sub-questions, search each broadly
2. **Depth agent** — Pick the 2-3 most important sub-topics and go deep (10+ searches)
3. **Recency agent** — Focus on developments from the last 12 months only
4. **Contrarian agent** — Search for criticisms, counterarguments, failures, and minority viewpoints
5. **Sources agent** — Find authoritative primary sources, academic papers, official docs, expert quotes

Each agent prompt should end with: "Write your findings as a structured markdown section with inline source URLs. Be exhaustive — use as many WebSearch and WebFetch calls as needed."

Once all 5 return, Claude synthesizes into the same final report format (Step 4) and saves to `RESEARCH/{topic-slug}/`. Skip Steps 3-4's monitoring parts and go straight to synthesis.

---

## Step 3 — Monitor (lightweight, skip for Internal mode)

While DeepSeek and Gemini work, periodically check their progress:

```bash
# Check DeepSeek
tmux capture-pane -t deepseek-research -p -S -500 | tail -30

# Check Gemini
tmux capture-pane -t gemini-research -p -S -500 | tail -30
```

Look for:
- DeepSeek: input prompt returning without spinner = done
- Gemini: input prompt bar without spinner = done
- If Gemini can't write files (common), capture its output from tmux: `tmux capture-pane -t gemini-research -p -S -3000 > /path/to/gemini_report.md`

---

## Step 4 — Synthesize & Format

Once both agents complete, Claude does the lightweight synthesis:

1. **Read** both reports (DeepSeek's saved file + Gemini's tmux capture)
2. **Merge & deduplicate** findings
3. **Build CSV** if the topic suits tabular output
4. **Upload to Google Sheets** using:
   ```bash
   cd ~/Dropbox/ClaudeProjects && source gsheets_venv/bin/activate && python upload_csv_to_google_sheets.py "/path/to/file.csv" "Sheet Title"
   ```
5. **Open in browser**: `open "SPREADSHEET_URL"`

### Final Report Structure

Save to `RESEARCH/{topic-slug}/full_report.md`:

```markdown
# Deep Research: {TOPIC}
_Generated: {date} | 2 research engines (DeepSeek, Gemini)_

---

## Executive Summary

## Key Findings
(Merged from both engines, deduplicated)

## Model Consensus
(What DeepSeek + Gemini both agreed on)

## Unique Findings
(What each engine found that the other missed)

## Contradictions & Open Questions

## Individual Reports
### DeepSeek Report
### Gemini Report

## Master References
(All unique sources, deduplicated)
```

---

## tmux Best Practices

**NEVER kill and recreate tmux sessions.** They are just shells — reuse them.

- If something goes wrong inside a tmux session (wrong command, error, Claude Code crash):
  - Press `Ctrl+C` to cancel the current process
  - You're back at the shell prompt — just run the next command
  - `tmux send-keys -t SESSION_NAME C-c` does this programmatically
- If Claude Code inside tmux needs to be restarted:
  - `tmux send-keys -t deepseek-research C-c` to stop it
  - Then send the launch command again into the SAME session
- To check if a session already exists before creating: `tmux has-session -t SESSION_NAME 2>/dev/null`
- To reattach a detached session to a Terminal window: `osascript -e 'tell application "Terminal" to do script "tmux attach -t SESSION_NAME"'`
- To capture output: `tmux capture-pane -t SESSION_NAME -p -S -3000 > /path/to/output.txt`
- Sessions persist across Terminal window closes — they're server-side

**Common mistakes to avoid:**
- `tmux kill-session` then `tmux new-session` — wasteful, just Ctrl+C and reuse
- Sending prompts to the wrong Terminal window via AppleScript — always verify with `tmux capture-pane` first
- Running `tmux send-keys ... Enter` when the session isn't at a prompt — check state first

## Key Principles

1. **DeepSeek does the heavy research** — it has WebSearch, WebFetch, Agent tool, file write. Let it use its own tokens.
2. **Gemini provides Google Search perspective** — different search engine, different model, different findings.
3. **Claude orchestrates** — launches sessions, monitors progress, synthesizes results, formats output, uploads to Google Sheets. Minimal token usage.
4. **Don't duplicate work** — if DeepSeek is researching, Claude should NOT also be running 8 parallel Agent sub-agents doing the same searches. That wastes Claude tokens.
5. **Reuse tmux sessions** — don't kill and recreate. They're just shells.
