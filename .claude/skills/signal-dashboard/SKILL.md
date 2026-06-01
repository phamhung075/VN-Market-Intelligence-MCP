<!-- size-justification: ~118L — SSOT protocol skill for DASHBOARD.md; §WRITE/§READ/§PRUNE condensed to summaries + pointers (full bodies in dashboard-protocol.md); §ACK/CLOSE, §Payload Pointer Discipline, §Signal types, §Docs to read kept inline (small lookup tables agents need without extra load) -->
---
name: signal-dashboard
description: SSOT protocol for cowork agent signal communication via docs/signals/DASHBOARD.md. Covers write, read, ack, close, and prune operations. READ uses two-phase delta-read to eliminate full-file token cost.
---

# Signal Dashboard — Communication Skill

**File:** `docs/signals/DASHBOARD.md`
**Rule:** This file is the SSOT inbox for cowork agents. Dev-team pipeline (`signals.db` + JSON) is separate — do NOT replace it. This dashboard complements it for cowork-to-cowork visibility.

---

## Sections (reader agents)

| Section | Receives from |
|---|---|
| `## po` | tran-ngoc-bau, agents-architect, system-auditor |
| `## tran-ngoc-bau` | unified-agent, market-watcher, financial-analyst (methodology flags) |
| `## unified-agent` | market-watcher, news-scout, digest-predict |
| `## alert-commander` | market-watcher, news-scout |

To add a new reader section: append `## {agent-id}` + empty table header to DASHBOARD.md.

---

## WRITE — append a signal row

Row format: `| {id} | {ts} | {from} | {type} | {summary ≤40 chars} | NEW | {payload path or "-"} |`
where `id = {from[0:3]}-{YYYYMMDDTHHmmss}`, `ts = ISO-8601 UTC compact`, `status = NEW`.
One row per signal. `summary` max 40 chars. `payload` = file path or `-`.
After appending: update `_Updated:` header — ONE line only (hard cap, no history).

→ Full protocol: `.claude/skills/signal-dashboard/dashboard-protocol.md § WRITE`

---

## READ — two-phase delta-read (0–400 tokens vs 38k full-file)

Phase 1 = stat mtime+linecount, skip entirely if unchanged (0 tokens).
Phase 2 = section-only offset read, collect NEW rows, load payload if present, mark READ, update cache.
Cache key: `dashboard_section_cache` in `docs/pipeline-state.json` (dev-team) or spawn-prompt (cowork agents).
No cache → skip Phase 1, go straight to Phase 2. Missing DASHBOARD.md or absent section → log + skip, never fail-loud.

→ Full protocol: `.claude/skills/signal-dashboard/dashboard-protocol.md § READ`

---

## ACK / CLOSE

- **ACK** (signal received, processing in progress): change `NEW` → `READ`
- **CLOSE** (signal fully consumed, no further action): change `READ` → `DONE`
- Edit in place — change only the `status` cell of the target row.

---

## PRUNE — MANDATORY after every drain/consume cycle

Remove DONE rows immediately (archive first). Remove READ rows after 48h (archive first).
Cap `_Updated:` to ONE line. Commit `DASHBOARD.md` + `DASHBOARD_ARCHIVE.md`.
NEW rows are NEVER pruned. This step is mandatory, not optional.

→ Full protocol: `.claude/skills/signal-dashboard/dashboard-protocol.md § PRUNE`

---

## Payload Pointer Discipline

Rules apply to NEW signals from cycle 2 of Sprint 1968 onward. No retroactive rewrite.

**Rule 1 — DASHBOARD summary column cap:**
When the summary column of a DASHBOARD.md row would exceed 120 chars, truncate to 80 chars and append a pointer:
```
<first 80 chars of summary> → docs/handoffs/TASK_NNN.md
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

## Signal types (canonical)

| type | Meaning | Common payload |
|---|---|---|
| `audit-handoff` | TNB quality audit complete | `docs/handoffs/tnb-audit-latest.md` |
| `brief_complete` | Architecture brief ready | `docs/architecture-briefs/*.md` |
| `market-signal` | Market anomaly / regime shift | `docs/signals/*.json` |
| `news-impact` | News chain with market impact | `docs/signals/*.json` |
| `system-issue` | Infrastructure problem | inline summary only |
| `methodology-flag` | Agent violated TNB methodology | notebook path |

---

## Docs to read per signal type

When READ finds a NEW row, load these docs:

| type | Docs to read |
|---|---|
| `audit-handoff` | payload path + `docs/standards/tnb-methodology.md` |
| `brief_complete` | payload path only |
| `market-signal` | payload path + `docs/policies/alert-policy.md` |
| `news-impact` | payload path + `docs/standards/alert-message-format.md` |
| `system-issue` | `docs/protocols/fail-loud-protocol.md` |
| `methodology-flag` | payload path + `docs/standards/tnb-methodology.md` |
