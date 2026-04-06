# Deep Research Skill

A Claude Code skill (`.claude/skills/deep-research/SKILL.md`) that orchestrates multi-engine deep research sessions on any topic.

## Modes

| Mode | Engines | Token Usage |
|------|---------|-------------|
| **Full** | DeepSeek + Gemini CLI via tmux | External (DeepSeek + Google) |
| **DeepSeek only** | DeepSeek via tmux | External (DeepSeek) |
| **Internal** | 5 parallel Claude subagents | Claude tokens only |

## How It Works

1. **Launch** — Spins up research engines in tmux sessions (or parallel Claude subagents)
2. **Research** — Engines use WebSearch, WebFetch, and sub-agents with 5 methodologies:
   - GPT-Researcher (sub-question decomposition)
   - Knowledge-Gap Filling (iterative gap detection)
   - ReAct Loop (reason → search → reason cycles)
   - Hierarchical (specialist sub-agents in parallel)
   - Source Triangulation (cross-reference & rate sources)
3. **Monitor** — Claude periodically checks tmux progress
4. **Synthesize** — Merges reports, deduplicates findings, flags contradictions
5. **Output** — Markdown report + optional CSV upload to Google Sheets

## Output Structure

```
RESEARCH/{topic-slug}/
├── deepseek_report.md
├── gemini_report.md
└── full_report.md
```

## Installation

Copy `SKILL.md` to `~/.claude/skills/deep-research/SKILL.md` in your Claude Code config.

## Prerequisites

- **Full/DeepSeek mode**: DeepSeek API key at `~/.anthropic_api_key`, tmux installed
- **Full mode**: Gemini CLI installed (`gemini` command available)
- **Internal mode**: No extra setup needed
- **Google Sheets upload** (optional): Python venv at `~/Dropbox/ClaudeProjects/gsheets_venv/`
