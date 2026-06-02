---
name: signal-dashboard-reference
description: Cold-path reference for signal-dashboard skill. Load when authoring signals with large payloads OR when routing to specific signal type docs. Parent SKILL.md covers the hot path.
---
# Signal Dashboard — Reference (Lazy-Load)

> Parent: `.claude/skills/signal-dashboard/SKILL.md`
> Load trigger: (a) writing a signal whose payload exceeds 120 chars, OR (b) routing an incoming signal and need to know which docs to read for its type.

---

## Payload Pointer Discipline

Rules apply to NEW signals from cycle 2 of Sprint 1968 onward. No retroactive rewrite.

**Rule 1 — summary field cap:**
`summary` field max 120 chars. When the payload would exceed this, truncate to 80 chars and set `payload_ref` to a handoff file:
```
"summary": "<first 80 chars> → docs/handoffs/TASK_NNN.md",
"payload_ref": "docs/handoffs/TASK_NNN.md"
```
Full details live in the handoff file, not the signal row.

**Rule 2 — PM sprint-kickoff signal payload cap:**
`pm sprint-kickoff` signal payload body must be ≤800 chars JSON. Format:
```json
{ "title": "...", "scope": "...", "tasks": ["1968a", "1968b"] }
```
Full plan lives in `docs/handoffs/SPRINT_NNN.md`. The signal is a pointer, not the plan.

**Rule 3 — Pointer integrity check:**
The writer of a truncated signal MUST verify the pointed file exists before emitting:
```
ls docs/handoffs/TASK_NNN.md  # must return the file, not ENOENT
```
No orphan pointers. If the file does not exist, create it first, then emit the signal.

---

## Docs to read per signal type

When READ finds a NEW row, load these docs:

| type | Docs to read |
|---|---|
| `audit-handoff` | payload_ref + `docs/standards/tnb-methodology.md` |
| `brief_complete` | payload_ref only |
| `market-signal` | payload_ref + `docs/policies/alert-policy.md` |
| `news-impact` | payload_ref + `docs/standards/alert-message-format.md` |
| `system-issue` | `docs/protocols/fail-loud-protocol.md` |
| `methodology-flag` | payload_ref + `docs/standards/tnb-methodology.md` |
