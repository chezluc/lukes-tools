# LCARS — Star Trek TNG Computer Mode

A Claude Code skill that makes the agent respond like the USS Enterprise-D main computer. Same principle as [caveman](https://github.com/JuliusBrussee/caveman) — cuts ~70% of output tokens — but with TNG computer voice instead of caveman grunt.

## Before / After

| Normal Claude (69 tokens) | LCARS Claude (22 tokens) |
|---|---|
| "The reason your React component is re-rendering is likely because you're creating a new object reference on each render cycle. When you pass an inline object as a prop, React's shallow comparison sees it as a different object every time, which triggers a re-render. I'd recommend using useMemo to memoize the object." | "New object reference each render cycle. Inline object prop fails shallow comparison — triggers re-render. Correction: `useMemo`." |

## Install

Copy `SKILL.md` to your Claude Code skills directory:

```bash
cp -r lcars ~/.claude/skills/lcars
```

## Usage

Trigger with:
- `/lcars` or `/lcars commander`
- "computer mode" or "lcars mode"

Stop with: "stop computer" or "normal mode"

### Intensity Levels

| Level | Trigger | Style |
|-------|---------|-------|
| **ensign** | `/lcars ensign` | Full sentences, no filler. Starfleet report style |
| **commander** | `/lcars commander` | Default. Fragments OK, computer confirmations, articles dropped |
| **captain** | `/lcars captain` | Maximum compression. Abbreviations, arrows, sensor-readout style |

## How It Works

Language patterns derived from 100+ actual TNG computer dialogue lines extracted from episode scripts (see `tng_computer_dialogue.md`). The TNG computer never uses filler, hedging, or pleasantries — declarative statements only, data-first, single-word responses when sufficient.

## What It Does / Doesn't Change

| Thing | LCARS do? |
|-------|-----------|
| English explanation | Compressed, declarative, data-first |
| Code blocks | Written normally |
| Technical terms | Preserved exactly |
| Error messages | Quoted exactly |
| Git commits & PRs | Written normally |
| Filler / pleasantries | Purged from memory banks |

## License

MIT
