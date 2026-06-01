<!-- size-justification: ~120L — SSOT protocol skill for orch-state.json .signal_queue; §WRITE/§READ/§PRUNE condensed to summaries + pointers (full bodies in dashboard-protocol.md); §ACK/CLOSE, §Payload Pointer Discipline, §Signal types, §Docs to read kept inline (small lookup tables agents need without extra load) -->
---
name: signal-dashboard
description: SSOT protocol for cowork agent signal communication via docs/data/orch/orch-state.json .signal_queue.rows[]. Covers write, read, ack, close, and prune operations. READ uses two-phase delta-read to eliminate full-file token cost.
---

# Signal Dashboard — Communication Skill

**File:** `docs/data/orch/orch-state.json` **section:** `.signal_queue`
**Rule:** This section is the SSOT inbox for cowork agents. Dev-team pipeline (`signals.db` + JSON) is separate — do NOT replace it. The signal_queue complements it for cowork-to-cowork visibility.
**Write protocol:** Every write to orch-state.json MUST use atomic temp-file-then-rename (see `docs/architecture-briefs/2026-06-01-orch-state-consolidate.md §2.3`). Read full file → modify only `.signal_queue` section → write atomically. NEVER overwrite sibling sections (`.head`, `.task_board`, `.narrative`).

---

## Receivers (row `to` field values)

| `to` value | Receives from |
|---|---|
| `po` | tran-ngoc-bau, agents-architect, system-auditor |
| `tran-ngoc-bau` | unified-agent, market-watcher, financial-analyst (methodology flags) |
| `unified-agent` | market-watcher, news-scout, digest-predict |
| `alert-commander` | market-watcher, news-scout |

To add a new receiver: use the `to` field in the row; no file-structure change needed.

---

## WRITE — append a signal row

Row shape: per orch-state.json schema `signal_queue.rows[]`:
```json
{
  "id": "{from[0:3]}-{YYYYMMDDTHHmmss}",
  "ts": "<ISO-8601 UTC compact>",
  "from": "<agent-id>",
  "to": "<agent-id>",
  "type": "<signal-type>",
  "summary": "<≤120 chars — NO raw payload>",
  "severity": "CRITICAL | HIGH | MED | LOW | INFO",
  "status": "NEW",
  "payload_ref": "<path-to-handoff-file or null>"
}
```
One row per signal. `summary` max 120 chars — strip to fit. `payload_ref` = file path or `null`.

→ Full protocol: `.claude/skills/signal-dashboard/dashboard-protocol.md § WRITE`

---

## READ — two-phase delta-read (0–400 tokens vs full-file)

Phase 1 = stat mtime, skip entirely if unchanged (0 tokens).
Phase 2 = jq filter on `.signal_queue.rows[]` for rows matching `to == my-agent-id` AND `status == "NEW"`, load payload_ref if present, mark READ, update cache.
Cache key: `dashboard_section_cache` in `docs/data/orch/orch-state.json` `.dashboard_section_cache` (dev-team) or spawn-prompt (cowork agents).
No cache → skip Phase 1, go straight to Phase 2. Missing orch-state.json or absent `.signal_queue` → log + skip, never fail-loud.

→ Full protocol: `.claude/skills/signal-dashboard/dashboard-protocol.md § READ`

---

## ACK / CLOSE

- **ACK** (signal received, processing in progress): update row `status: "NEW"` → `"READ"` (atomic write)
- **CLOSE** (signal fully consumed, no further action): update row `status: "READ"` → `"RESOLVED"` (atomic write)
- Modify only the target row's `status` field in `.signal_queue.rows[]` — never overwrite other rows or sections.

---

## PRUNE — MANDATORY after every drain/consume cycle

Archive rows where `status == "RESOLVED" || (status == "READ" && ts < now() - 48h)` to `.signal_queue.archive[]`.
Remove archived rows from `.signal_queue.rows[]`.
Update `.signal_queue._updated_at` + `._updated_by`.
Max 200 rows in `.signal_queue.rows[]` — prune oldest resolved/read first if approaching limit.
NEW rows are NEVER pruned. This step is mandatory, not optional.

→ Full protocol: `.claude/skills/signal-dashboard/dashboard-protocol.md § PRUNE`

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

## Signal types (canonical)

| type | Meaning | Common payload_ref |
|---|---|---|
| `audit-handoff` | TNB quality audit complete | `docs/handoffs/tnb-audit-latest.md` |
| `brief_complete` | Architecture brief ready | `docs/architecture-briefs/*.md` |
| `market-signal` | Market anomaly / regime shift | `docs/signals/*.json` |
| `news-impact` | News chain with market impact | `docs/signals/*.json` |
| `system-issue` | Infrastructure problem | null (inline summary only) |
| `methodology-flag` | Agent violated TNB methodology | notebook path |

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
