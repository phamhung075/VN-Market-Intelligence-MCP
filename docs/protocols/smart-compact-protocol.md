# Smart Compact Protocol

Context management system. Hooks fire automatically — agents must respond correctly.

Token counting, auto-compact triggers, and agent offload strategies.

---

## How Token Count Works

Token count is read **directly from JSONL session files** (exact API usage data):
- Fields summed: `input_tokens + cache_read_input_tokens + cache_creation_input_tokens`
- This matches exactly what Claude Code status bar shows
- No estimation — 100% accurate

---

## Hook Overview

| Hook | Event | Threshold | What Happens |
|---|---|---|---|
| `UserPromptSubmit` | Every user message | always | Calibrate iTerm2 session ID + overhead tokens (once per session) |
| `PostToolUse:TaskUpdate` | Task marked `completed` | ctx > 20% | Inject offload instructions only — no auto-compact (unsafe mid-sprint) |
| `Stop` | Every response end | ctx > 30% | Inject soft warning into session |
| `Stop` | Every response end | ctx > 40% | Inject urgent instructions + auto-type `/compact` in iTerm2 |

---

## When Hook Fires — Agent MUST

1. Call `log_agent_work` or `append_session_record` to offload current state to MCP
2. Write current working state to own notebook: `docs/agent-memory/notebooks/<agent-id>.md`
3. Stop re-reading files already processed this session
4. Stop inlining large data — store via MCP tool, reference by key only

---

## Context Budget Targets per Step

| Step | Max ctx to spend | Action if exceeded |
|---|---|---|
| Step 1 (PO Triage) | 15% | Offload BATCH and compact before planning |
| Step 2 (Planning) | 20% | Offload plan and compact before execution |
| Step 3 per tier | 25% | Finish tier, offload, compact between tiers |
| Step 4 (Scan) | 5% | Minimal — just tool calls, no inline data |

---

## Thresholds (configurable)

| Var | Default | Meaning |
|---|---|---|
| `CTX_ADVISOR_TASK_COMPACT_PCT` | 20% | Min ctx% to fire on task completion |
| `CTX_ADVISOR_MOD_PCT` | 30% | Soft warning threshold |
| `CTX_ADVISOR_HIGH_PCT` | 40% | Urgent inject + auto-compact threshold |
| `CTX_ADVISOR_DELTA_PCT` | 10% | Min % growth between Stop hook fires |
| `CTX_ADVISOR_MAX_TOKENS` | 200000 | Sonnet max context tokens |

---

## Hook Mechanics & Auto-Compact

→ see `./smart-compact-protocol-hooks.md`

## Dev-Team Orchestration & Offloading

→ see `./smart-compact-protocol-offload.md`

---

**Last updated:** Smart context management system active in all Claude Code environments.
